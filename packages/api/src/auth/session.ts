import { and, eq, gt } from "drizzle-orm"
import type { Database } from "../db/client"
import { sessions, users } from "../db/schema"
import { randomBytes, sha256Hex, toBase64Url } from "../util/crypto"

export const SESSION_COOKIE = "kiwii_session"
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
// Sliding expiry: extend when less than this remains so active users never get logged out.
const SESSION_REFRESH_MS = 7 * 24 * 60 * 60 * 1000

export async function createSession(db: Database, input: { userID: string; ip?: string; userAgent?: string }) {
  const token = toBase64Url(randomBytes(32))
  await db.insert(sessions).values({
    token_hash: await sha256Hex(token),
    user_id: input.userID,
    expires_at: Date.now() + SESSION_TTL_MS,
    ip: input.ip,
    user_agent: input.userAgent?.slice(0, 256),
  })
  return token
}

export async function resolveSession(db: Database, token: string) {
  const hash = await sha256Hex(token)
  const now = Date.now()
  const row = await db
    .select({ user: users, expires_at: sessions.expires_at })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.user_id))
    .where(and(eq(sessions.token_hash, hash), gt(sessions.expires_at, now)))
    .get()
  if (!row) return undefined
  if (row.expires_at - now < SESSION_TTL_MS - SESSION_REFRESH_MS) {
    await db
      .update(sessions)
      .set({ expires_at: now + SESSION_TTL_MS })
      .where(eq(sessions.token_hash, hash))
  }
  return row.user
}

export async function destroySession(db: Database, token: string) {
  await db.delete(sessions).where(eq(sessions.token_hash, await sha256Hex(token)))
}

export function sessionCookie(token: string, secure: boolean) {
  const attrs = [`${SESSION_COOKIE}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${SESSION_TTL_MS / 1000}`]
  if (secure) attrs.push("Secure")
  return attrs.join("; ")
}

export function clearSessionCookie(secure: boolean) {
  const attrs = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"]
  if (secure) attrs.push("Secure")
  return attrs.join("; ")
}
