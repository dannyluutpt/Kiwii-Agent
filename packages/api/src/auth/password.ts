import { fromHex, randomBytes, timingSafeEqual, toHex } from "../util/crypto"

// 100k is the most the native WebCrypto path handles comfortably; raise it and old hashes
// get upgraded on next login via `needsRehash`.
export const PASSWORD_ITERATIONS = 100_000

const encoder = new TextEncoder()

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"])
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256)
  return toHex(bits)
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16)
  return {
    hash: await derive(password, salt, PASSWORD_ITERATIONS),
    salt: toHex(salt),
    iterations: PASSWORD_ITERATIONS,
  }
}

export async function verifyPassword(password: string, stored: { hash: string; salt: string; iterations: number }) {
  const hash = await derive(password, fromHex(stored.salt), stored.iterations)
  return timingSafeEqual(hash, stored.hash)
}

export function needsRehash(iterations: number) {
  return iterations !== PASSWORD_ITERATIONS
}

export function validatePassword(password: string) {
  if (password.length < 8) return "Mật khẩu phải có ít nhất 8 ký tự"
  if (password.length > 128) return "Mật khẩu quá dài"
  return undefined
}
