import { z } from "zod"
import { ApiError, createApp } from "../app"
import { sendEmail } from "../auth/email"
import { BRAND } from "../brand"
import { clientIP, consumeWindow, rateLimitBy } from "../middleware/ratelimit"
import { verifyTurnstile } from "../middleware/turnstile"
import { adminEmail } from "../report"

const Message = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  message: z.string().trim().min(10).max(4000),
  turnstile: z.string().optional(),
})

const DAY = 24 * 60 * 60 * 1000

export const support = createApp()

support.use(
  "*",
  rateLimitBy((env) => env.RL_AUTH, "support"),
)

// A message from the Support page to the owner's inbox (app_config.admin_email). The domain does not
// receive email, so this form is how a customer reaches a person; the sender's address is in the
// message for the reply. Five a day from one address and from one network.
support.post("/", async (c) => {
  const body = Message.parse(await c.req.json())
  const db = c.get("db")
  const ip = clientIP(c.req.raw.headers)
  await verifyTurnstile(c.env, body.turnstile, ip)
  const to = await adminEmail(db)
  if (!to) throw new ApiError(500, "SUPPORT_NOT_CONFIGURED", "Chưa nhận được yêu cầu hỗ trợ lúc này, hãy thử lại sau")
  for (const key of [`support:${body.email}`, `support-ip:${ip}`]) {
    const window = await consumeWindow(db, { key, limit: 5, windowMs: DAY })
    if (!window.allowed)
      throw new ApiError(429, "RATE_LIMITED", "Bạn đã gửi nhiều yêu cầu hôm nay, hãy thử lại vào ngày mai")
  }
  await sendEmail(c.env, {
    to,
    subject: `[${BRAND}] Hỗ trợ: ${body.email}`,
    text: `Từ: ${body.email}\nTrả lời khách bằng cách viết email tới địa chỉ trên.\n\n${body.message}`,
  })
  return c.json({ ok: true })
})
