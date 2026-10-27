import { eq } from "drizzle-orm"
import { getCookie } from "hono/cookie"
import { ulid } from "ulid"
import { z } from "zod"
import { ApiError, createApp } from "../app"
import { otpEmail, sendEmail } from "../auth/email"
import { generateOTP, hashOTP, OTP_MAX_ATTEMPTS, OTP_RESEND_MS, OTP_TTL_MS, verifyOTP } from "../auth/otp"
import { hashPassword, needsRehash, validatePassword, verifyPassword } from "../auth/password"
import { clearSessionCookie, createSession, destroySession, SESSION_COOKIE, sessionCookie } from "../auth/session"
import { todayUsage, loadPlan } from "../chat/quota"
import { password_resets, pending_signups, users } from "../db/schema"
import { clientIP, consumeWindow, rateLimitBy } from "../middleware/ratelimit"
import { requireAuth } from "../middleware/auth"
import { verifyTurnstile } from "../middleware/turnstile"

const Email = z.string().trim().toLowerCase().email().max(254)
const Code = z
  .string()
  .trim()
  .regex(/^\d{4}$/)

const SignupBody = z.object({ email: Email, password: z.string(), turnstile: z.string().optional() })
const VerifyBody = z.object({ email: Email, code: Code })
const ResendBody = z.object({ email: Email })
const LoginBody = z.object({ email: Email, password: z.string(), turnstile: z.string().optional() })
const ForgotBody = z.object({ email: Email, turnstile: z.string().optional() })
const ResetBody = z.object({ email: Email, code: Code, password: z.string() })

export const auth = createApp()

auth.use(
  "*",
  rateLimitBy((env) => env.RL_AUTH, "auth"),
)

auth.post("/signup", async (c) => {
  const body = SignupBody.parse(await c.req.json())
  const db = c.get("db")
  await verifyTurnstile(c.env, body.turnstile, clientIP(c.req.raw.headers))
  const invalid = validatePassword(body.password)
  if (invalid) throw new ApiError(400, "WEAK_PASSWORD", invalid)
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).get()
  if (existing) throw new ApiError(409, "EMAIL_TAKEN", "Email này đã được đăng ký")
  await assertOtpSendAllowed(db, body.email)
  const code = generateOTP()
  const password = await hashPassword(body.password)
  const now = Date.now()
  await db
    .insert(pending_signups)
    .values({
      email: body.email,
      password_hash: password.hash,
      password_salt: password.salt,
      password_iterations: password.iterations,
      otp_hash: await hashOTP(body.email, code),
      attempts: 0,
      expires_at: now + OTP_TTL_MS,
      last_sent_at: now,
    })
    .onConflictDoUpdate({
      target: pending_signups.email,
      set: {
        password_hash: password.hash,
        password_salt: password.salt,
        password_iterations: password.iterations,
        otp_hash: await hashOTP(body.email, code),
        attempts: 0,
        expires_at: now + OTP_TTL_MS,
        last_sent_at: now,
      },
    })
  await sendEmail(c.env, { to: body.email, ...otpEmail({ code, purpose: "signup" }) })
  return c.json({ ok: true, expiresAt: now + OTP_TTL_MS })
})

auth.post("/signup/resend", async (c) => {
  const body = ResendBody.parse(await c.req.json())
  const db = c.get("db")
  const pending = await db.select().from(pending_signups).where(eq(pending_signups.email, body.email)).get()
  if (!pending) throw new ApiError(404, "SIGNUP_NOT_FOUND", "Không tìm thấy đăng ký đang chờ, hãy đăng ký lại")
  if (Date.now() - pending.last_sent_at < OTP_RESEND_MS) {
    throw new ApiError(429, "OTP_TOO_SOON", "Vui lòng đợi một phút trước khi gửi lại mã")
  }
  await assertOtpSendAllowed(db, body.email)
  const code = generateOTP()
  const now = Date.now()
  await db
    .update(pending_signups)
    .set({ otp_hash: await hashOTP(body.email, code), attempts: 0, expires_at: now + OTP_TTL_MS, last_sent_at: now })
    .where(eq(pending_signups.email, body.email))
  await sendEmail(c.env, { to: body.email, ...otpEmail({ code, purpose: "signup" }) })
  return c.json({ ok: true, expiresAt: now + OTP_TTL_MS })
})

auth.post("/signup/verify", async (c) => {
  const body = VerifyBody.parse(await c.req.json())
  const db = c.get("db")
  const pending = await db.select().from(pending_signups).where(eq(pending_signups.email, body.email)).get()
  if (!pending || pending.expires_at < Date.now()) {
    throw new ApiError(400, "OTP_EXPIRED", "Mã đã hết hạn, hãy yêu cầu mã mới")
  }
  if (pending.attempts >= OTP_MAX_ATTEMPTS) {
    throw new ApiError(400, "OTP_LOCKED", "Nhập sai quá nhiều lần, hãy yêu cầu mã mới")
  }
  if (!(await verifyOTP(body.email, body.code, pending.otp_hash))) {
    await db
      .update(pending_signups)
      .set({ attempts: pending.attempts + 1 })
      .where(eq(pending_signups.email, body.email))
    throw new ApiError(400, "OTP_INVALID", "Mã không đúng", { remaining: OTP_MAX_ATTEMPTS - pending.attempts - 1 })
  }
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).get()
  if (existing) throw new ApiError(409, "EMAIL_TAKEN", "Email này đã được đăng ký")
  const userID = ulid()
  await db.batch([
    db.insert(users).values({
      id: userID,
      email: body.email,
      password_hash: pending.password_hash,
      password_salt: pending.password_salt,
      password_iterations: pending.password_iterations,
    }),
    db.delete(pending_signups).where(eq(pending_signups.email, body.email)),
  ])
  const token = await createSession(db, {
    userID,
    ip: clientIP(c.req.raw.headers),
    userAgent: c.req.header("user-agent"),
  })
  c.header("set-cookie", sessionCookie(token, isSecure(c.req.url)))
  return c.json({ ok: true })
})

auth.post("/login", async (c) => {
  const body = LoginBody.parse(await c.req.json())
  const db = c.get("db")
  await verifyTurnstile(c.env, body.turnstile, clientIP(c.req.raw.headers))
  const user = await db.select().from(users).where(eq(users.email, body.email)).get()
  // Hash anyway so a missing account takes as long as a wrong password.
  const stored = user
    ? { hash: user.password_hash, salt: user.password_salt, iterations: user.password_iterations }
    : { hash: "0".repeat(64), salt: "0".repeat(32), iterations: 100_000 }
  const ok = await verifyPassword(body.password, stored)
  if (!user || !ok) throw new ApiError(401, "BAD_CREDENTIALS", "Email hoặc mật khẩu không đúng")
  if (needsRehash(user.password_iterations)) {
    const next = await hashPassword(body.password)
    await db
      .update(users)
      .set({ password_hash: next.hash, password_salt: next.salt, password_iterations: next.iterations })
      .where(eq(users.id, user.id))
  }
  const token = await createSession(db, {
    userID: user.id,
    ip: clientIP(c.req.raw.headers),
    userAgent: c.req.header("user-agent"),
  })
  c.header("set-cookie", sessionCookie(token, isSecure(c.req.url)))
  return c.json({ ok: true })
})

auth.post("/logout", async (c) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (token) await destroySession(c.get("db"), token)
  c.header("set-cookie", clearSessionCookie(isSecure(c.req.url)))
  return c.json({ ok: true })
})

auth.post("/forgot", async (c) => {
  const body = ForgotBody.parse(await c.req.json())
  const db = c.get("db")
  await verifyTurnstile(c.env, body.turnstile, clientIP(c.req.raw.headers))
  const user = await db.select({ id: users.id }).from(users).where(eq(users.email, body.email)).get()
  // Always answer ok so the endpoint cannot be used to probe which emails exist.
  if (!user) return c.json({ ok: true })
  await assertOtpSendAllowed(db, body.email)
  const code = generateOTP()
  const now = Date.now()
  await db
    .insert(password_resets)
    .values({
      email: body.email,
      otp_hash: await hashOTP(body.email, code),
      attempts: 0,
      expires_at: now + OTP_TTL_MS,
      last_sent_at: now,
    })
    .onConflictDoUpdate({
      target: password_resets.email,
      set: { otp_hash: await hashOTP(body.email, code), attempts: 0, expires_at: now + OTP_TTL_MS, last_sent_at: now },
    })
  await sendEmail(c.env, { to: body.email, ...otpEmail({ code, purpose: "reset" }) })
  return c.json({ ok: true })
})

auth.post("/reset", async (c) => {
  const body = ResetBody.parse(await c.req.json())
  const db = c.get("db")
  const invalid = validatePassword(body.password)
  if (invalid) throw new ApiError(400, "WEAK_PASSWORD", invalid)
  const reset = await db.select().from(password_resets).where(eq(password_resets.email, body.email)).get()
  if (!reset || reset.expires_at < Date.now())
    throw new ApiError(400, "OTP_EXPIRED", "Mã đã hết hạn, hãy yêu cầu mã mới")
  if (reset.attempts >= OTP_MAX_ATTEMPTS)
    throw new ApiError(400, "OTP_LOCKED", "Nhập sai quá nhiều lần, hãy yêu cầu mã mới")
  if (!(await verifyOTP(body.email, body.code, reset.otp_hash))) {
    await db
      .update(password_resets)
      .set({ attempts: reset.attempts + 1 })
      .where(eq(password_resets.email, body.email))
    throw new ApiError(400, "OTP_INVALID", "Mã không đúng", { remaining: OTP_MAX_ATTEMPTS - reset.attempts - 1 })
  }
  const next = await hashPassword(body.password)
  await db.batch([
    db
      .update(users)
      .set({ password_hash: next.hash, password_salt: next.salt, password_iterations: next.iterations })
      .where(eq(users.email, body.email)),
    db.delete(password_resets).where(eq(password_resets.email, body.email)),
  ])
  return c.json({ ok: true })
})

auth.get("/me", requireAuth, async (c) => {
  const user = c.get("user")
  const db = c.get("db")
  const plan = await loadPlan(db, user)
  return c.json({
    user: { id: user.id, email: user.email, locale: user.locale, createdAt: user.created_at },
    tier: plan.id,
    tierUntil: user.tier_until,
    plan: {
      id: plan.id,
      name: plan.name_vi,
      credits: plan.credits,
      chatDailyMessages: plan.chat_daily_messages,
      chatMonthlyMessages: plan.chat_monthly_messages,
    },
    credits: 0,
    chatToday: await todayUsage(db, user.id),
  })
})

async function assertOtpSendAllowed(db: Parameters<typeof consumeWindow>[0], email: string) {
  const daily = await consumeWindow(db, { key: `otp:${email}`, limit: 5, windowMs: 24 * 60 * 60 * 1000 })
  if (!daily.allowed) throw new ApiError(429, "OTP_DAILY_LIMIT", "Email này đã nhận quá nhiều mã hôm nay")
}

function isSecure(url: string) {
  return url.startsWith("https://")
}
