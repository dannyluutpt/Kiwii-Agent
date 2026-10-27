import { ApiError } from "../app"
import type { Env } from "../env"

// Skipped when no secret is configured so local dev and tests work without the widget.
export async function verifyTurnstile(env: Env, token: string | undefined, ip: string) {
  if (!env.TURNSTILE_SECRET_KEY) return
  if (!token) throw new ApiError(400, "TURNSTILE_REQUIRED", "Vui lòng xác nhận bạn không phải robot")
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
  })
  const body = (await res.json()) as { success?: boolean }
  if (!body.success) throw new ApiError(400, "TURNSTILE_FAILED", "Xác minh robot thất bại, thử lại")
}
