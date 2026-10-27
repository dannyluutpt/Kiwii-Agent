import { sha256Hex, timingSafeEqual } from "../util/crypto"

export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_RESEND_MS = 60 * 1000
export const OTP_MAX_ATTEMPTS = 5

export function generateOTP() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 10_000
  return n.toString().padStart(4, "0")
}

// The hash is salted with the email so the same code for two addresses never shares a digest.
export function hashOTP(email: string, code: string) {
  return sha256Hex(`${email.toLowerCase()}:${code}`)
}

export async function verifyOTP(email: string, code: string, hash: string) {
  return timingSafeEqual(await hashOTP(email, code), hash)
}
