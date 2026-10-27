import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { ApiError, createApp } from "./app"
import { runDaily } from "./cron"
import { createDatabase } from "./db/client"
import type { Env } from "./env"
import { rateLimitBy } from "./middleware/ratelimit"
import { account } from "./routes/account"
import { auth } from "./routes/auth"
import { billing } from "./routes/billing"
import { chat } from "./routes/chat"

const app = createApp()

// One canonical host: www and the workers.dev hostname redirect to APP_URL.
app.use("*", async (c, next) => {
  const canonical = new URL(c.env.APP_URL)
  const url = new URL(c.req.url)
  if (canonical.hostname === "localhost" || url.hostname === canonical.hostname) return next()
  if (url.hostname !== `www.${canonical.hostname}` && !url.hostname.endsWith(".workers.dev")) return next()
  url.host = canonical.host
  url.protocol = canonical.protocol
  return c.redirect(url.toString(), 301)
})

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
app.route("/api/billing", billing)
app.route("/api/account", account)

app.get("/api/health", (c) => c.json({ ok: true, time: Date.now() }))
// Everything outside /api is the SPA; routing through the Worker keeps the host redirect above.
app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404)
  return c.env.ASSETS.fetch(c.req.raw)
})

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
    await runDaily(env)
  },
} satisfies ExportedHandler<Env>
