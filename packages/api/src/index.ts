import { lt } from "drizzle-orm"
import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { ApiError, createApp } from "./app"
import { createDatabase } from "./db/client"
import { password_resets, pending_signups, sessions } from "./db/schema"
import type { Env } from "./env"
import { rateLimitBy } from "./middleware/ratelimit"
import { auth } from "./routes/auth"
import { chat } from "./routes/chat"

const app = createApp()

app.use("/api/*", async (c, next) => {
  c.set("db", createDatabase(c.env.DB))
  c.header("cache-control", "no-store")
  await next()
})
app.use(
  "/api/*",
  rateLimitBy((env) => env.RL_IP, "ip"),
)

app.route("/api/auth", auth)
app.route("/api/chat", chat)

app.get("/api/health", (c) => c.json({ ok: true, time: Date.now() }))
app.notFound((c) => c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404))

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json({ error: { code: error.code, message: error.message, ...error.extra } }, error.status)
  }
  if (error instanceof z.ZodError) {
    return c.json({ error: { code: "INVALID_INPUT", message: "Dữ liệu không hợp lệ", issues: error.issues } }, 400)
  }
  if (error instanceof HTTPException) return error.getResponse()
  console.error(error)
  return c.json({ error: { code: "INTERNAL", message: "Lỗi hệ thống" } }, 500)
})

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env) {
    const db = createDatabase(env.DB)
    const now = Date.now()
    await db.batch([
      db.delete(pending_signups).where(lt(pending_signups.expires_at, now)),
      db.delete(password_resets).where(lt(password_resets.expires_at, now)),
      db.delete(sessions).where(lt(sessions.expires_at, now)),
    ])
  },
} satisfies ExportedHandler<Env>
