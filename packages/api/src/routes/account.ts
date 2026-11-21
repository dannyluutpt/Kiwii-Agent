import { and, eq, ne } from "drizzle-orm"
import { getCookie } from "hono/cookie"
import { z } from "zod"
import { ApiError, createApp } from "../app"
import { hashPassword, validatePassword, verifyPassword } from "../auth/password"
import { SESSION_COOKIE } from "../auth/session"
import { sessions, users } from "../db/schema"
import { referralCode, referralRewards, referralStats } from "../billing/referral"
import { requireAuth } from "../middleware/auth"
import { sha256Hex } from "../util/crypto"

const Patch = z.object({ locale: z.enum(["vi", "en"]) })
const Password = z.object({ current: z.string(), next: z.string() })

export const account = createApp()

account.use("*", requireAuth)

account.patch("/", async (c) => {
  const body = Patch.parse(await c.req.json())
  await c
    .get("db")
    .update(users)
    .set({ locale: body.locale })
    .where(eq(users.id, c.get("user").id))
  return c.json({ ok: true })
})

account.post("/password", async (c) => {
  const body = Password.parse(await c.req.json())
  const user = c.get("user")
  const invalid = validatePassword(body.next)
  if (invalid) throw new ApiError(400, "WEAK_PASSWORD", invalid)
  const ok = await verifyPassword(body.current, {
    hash: user.password_hash,
    salt: user.password_salt,
    iterations: user.password_iterations,
  })
  if (!ok) throw new ApiError(401, "BAD_CREDENTIALS", "Mật khẩu hiện tại không đúng")
  const next = await hashPassword(body.next)
  const db = c.get("db")
  // Other devices must log in again with the new password; this session keeps its cookie.
  await db.batch([
    db
      .update(users)
      .set({ password_hash: next.hash, password_salt: next.salt, password_iterations: next.iterations })
      .where(eq(users.id, user.id)),
    db
      .delete(sessions)
      .where(
        and(
          eq(sessions.user_id, user.id),
          ne(sessions.token_hash, await sha256Hex(getCookie(c, SESSION_COOKIE) ?? "")),
        ),
      ),
  ])
  return c.json({ ok: true })
})

// The account's invitation link, what an invitation earns and what its invitations have come to.
account.get("/referral", async (c) => {
  const db = c.get("db")
  const user = c.get("user")
  const code = await referralCode(db, user.id)
  return c.json({
    code,
    link: `${new URL(c.env.APP_URL).origin}/?ref=${code}`,
    rewards: await referralRewards(db),
    ...(await referralStats(db, user.id)),
  })
})

account.post("/logout-all", async (c) => {
  await c
    .get("db")
    .delete(sessions)
    .where(eq(sessions.user_id, c.get("user").id))
  return c.json({ ok: true })
})
