import { sql } from "drizzle-orm"
import { createMiddleware } from "hono/factory"
import { ApiError, type AppEnv } from "../app"
import type { Database } from "../db/client"
import { rate_limits } from "../db/schema"
import type { RateLimit } from "../env"

export function clientIP(headers: Headers) {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
}

// Cloudflare's rate limit binding is absent in some local setups; fail open there.
export const rateLimitBy = (pick: (env: AppEnv["Bindings"]) => RateLimit | undefined, scope: string) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const limiter = pick(c.env)
    if (limiter) {
      const { success } = await limiter.limit({ key: `${scope}:${clientIP(c.req.raw.headers)}` })
      if (!success) throw new ApiError(429, "RATE_LIMITED", "Bạn thao tác quá nhanh, thử lại sau một phút")
    }
    await next()
  })

// Durable per-key counter in D1 for limits that must survive across isolates (OTP sends, daily quotas).
export async function consumeWindow(db: Database, input: { key: string; limit: number; windowMs: number }) {
  const now = Date.now()
  const row = await db
    .insert(rate_limits)
    .values({ key: input.key, window_start: now, count: 1 })
    .onConflictDoUpdate({
      target: rate_limits.key,
      set: {
        count: sql`CASE WHEN ${rate_limits.window_start} + ${input.windowMs} < ${now} THEN 1 ELSE ${rate_limits.count} + 1 END`,
        window_start: sql`CASE WHEN ${rate_limits.window_start} + ${input.windowMs} < ${now} THEN ${now} ELSE ${rate_limits.window_start} END`,
      },
    })
    .returning({ count: rate_limits.count, window_start: rate_limits.window_start })
    .get()
  return {
    allowed: row.count <= input.limit,
    retryAfterMs: Math.max(0, row.window_start + input.windowMs - now),
  }
}
