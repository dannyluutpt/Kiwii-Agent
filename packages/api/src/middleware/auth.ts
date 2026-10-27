import { getCookie } from "hono/cookie"
import { createMiddleware } from "hono/factory"
import { ApiError, type AppEnv } from "../app"
import { resolveSession, SESSION_COOKIE } from "../auth/session"

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE)
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "Bạn cần đăng nhập")
  const user = await resolveSession(c.get("db"), token)
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Phiên đăng nhập đã hết hạn")
  c.set("user", user)
  await next()
})
