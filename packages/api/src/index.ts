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
import { images } from "./routes/images"

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
app.route("/api/images", images)

// Reports which optional settings are present (never their values) so a misplaced secret is
// visible without reading Worker logs.
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    time: Date.now(),
    config: {
      openrouter: Boolean(c.env.OPENROUTER_API_KEY),
      sepayWebhook: Boolean(c.env.SEPAY_API_KEY),
      sepayBank: Boolean(c.env.SEPAY_BANK_ACCOUNT),
      turnstile: Boolean(c.env.TURNSTILE_SITE_KEY && c.env.TURNSTILE_SECRET_KEY),
      email: Boolean(c.env.EMAIL),
    },
  }),
)
// Everything outside /api is the SPA; routing through the Worker keeps the host redirect above.
// HTML responses get a CSP that allows only the origins the app actually talks to.
const CSP = [
  "default-src 'self'",
  // wasm-unsafe-eval: shiki highlights code blocks with a WebAssembly build of Oniguruma.
  "script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img.vietqr.io",
  "font-src 'self' data:",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

app.notFound(async (c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: { code: "NOT_FOUND", message: "Không tìm thấy" } }, 404)
  const res = await c.env.ASSETS.fetch(c.req.raw)
  if (!res.headers.get("content-type")?.includes("text/html")) return res
  const headers = new Headers(res.headers)
  headers.set("content-security-policy", CSP)
  headers.set("x-content-type-options", "nosniff")
  headers.set("referrer-policy", "strict-origin-when-cross-origin")
  return new Response(res.body, { status: res.status, headers })
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
