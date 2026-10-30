import { HTTPException } from "hono/http-exception"
import { z } from "zod"
import { ApiError, createApp } from "./app"
import { runDaily } from "./cron"
import { createDatabase } from "./db/client"
import type { Env } from "./env"
import { rateLimitBy, skipsIPLimit } from "./middleware/ratelimit"
import { account } from "./routes/account"
import { auth } from "./routes/auth"
import { billing } from "./routes/billing"
import { characters } from "./routes/characters"
import { images } from "./routes/images"
import { locations } from "./routes/locations"
import { projects } from "./routes/projects"
import { videos } from "./routes/videos"

const app = createApp()

// One canonical host: www, the workers.dev hostname and the hostnames the app moved from redirect to
// APP_URL, keeping the path. A host the app moved from still answers /api: payment webhooks call
// it, and so do pages opened before the move.
app.use("*", async (c, next) => {
  const canonical = new URL(c.env.APP_URL)
  const url = new URL(c.req.url)
  if (canonical.hostname === "localhost" || url.hostname === canonical.hostname) return next()
  const moved = (c.env.MOVED_FROM ?? "").split(/\s+/).includes(url.hostname)
  if (moved && url.pathname.startsWith("/api/")) return next()
  const alias = moved || url.hostname === `www.${canonical.hostname}` || url.hostname.endsWith(".workers.dev")
  if (!alias) return next()
  url.host = canonical.host
  url.protocol = canonical.protocol
  return c.redirect(url.toString(), 301)
})

app.use("/api/*", async (c, next) => {
  c.set("db", createDatabase(c.env.DB))
  c.header("cache-control", "no-store")
  await next()
})
const ipLimit = rateLimitBy((env) => env.RL_IP, "ip")
app.use("/api/*", (c, next) => (skipsIPLimit(c.req.method, c.req.path) ? next() : ipLimit(c, next)))

app.route("/api/auth", auth)
app.route("/api/billing", billing)
app.route("/api/account", account)
app.route("/api/images", images)
app.route("/api/projects", projects)
app.route("/api/characters", characters)
app.route("/api/locations", locations)
app.route("/api/videos", videos)

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
  // cloudflareinsights: Cloudflare Web Analytics injects its beacon into proxied pages.
  "script-src 'self' https://challenges.cloudflare.com https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://img.vietqr.io",
  "font-src 'self' data:",
  "connect-src 'self' https://challenges.cloudflare.com https://cloudflareinsights.com",
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
  const html = res.headers.get("content-type")?.includes("text/html")
  // Safari plays a clip only from a server that answers byte ranges, and the assets binding always sends
  // the whole file: the website's sample clips are cut to the range asked for here.
  const range = c.req.header("range")
  if (!html && range && res.status === 200) return byteRange(res, range)
  if (!html) return res
  const headers = new Headers(res.headers)
  headers.set("content-security-policy", CSP)
  headers.set("x-content-type-options", "nosniff")
  headers.set("referrer-policy", "strict-origin-when-cross-origin")
  return new Response(res.body, { status: res.status, headers })
})

// The bytes of one "bytes=a-b", "bytes=a-" or "bytes=-n" range as a 206; a range past the end is a 416,
// and a header it does not read (several ranges, other units) gets the whole file.
async function byteRange(res: Response, range: string) {
  const body = new Uint8Array(await res.arrayBuffer())
  const size = body.length
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  if (!match || (!match[1] && !match[2])) return new Response(body, { status: 200, headers: res.headers })
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]))
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1
  if (start >= size || start > end) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } })
  }
  const headers = new Headers(res.headers)
  headers.set("accept-ranges", "bytes")
  headers.set("content-range", `bytes ${start}-${end}/${size}`)
  headers.set("content-length", String(end - start + 1))
  return new Response(body.subarray(start, end + 1), { status: 206, headers })
}

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
