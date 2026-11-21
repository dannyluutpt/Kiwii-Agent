import { sha256Hex, timingSafeEqual } from "../util/crypto"

export const OTP_TTL_MS = 10 * 60 * 1000
export const OTP_RESEND_MS = 60 * 1000
export const OTP_MAX_ATTEMPTS = 5

// Six digits: with five tries a code and five codes a day, a guesser gets 25 in a million a day.
// Four digits gave 25 in ten thousand, enough to take over an account in every few hundred tried.
export const OTP_DIGITS = 6

export function generateOTP() {
  const n = crypto.getRandomValues(new Uint32Array(1))[0]! % 10 ** OTP_DIGITS
  return n.toString().padStart(OTP_DIGITS, "0")
}

// The hash is salted with the email so the same code for two addresses never shares a digest.
export function hashOTP(email: string, code: string) {
  return sha256Hex(`${email.toLowerCase()}:${code}`)
}

export async function verifyOTP(email: string, code: string, hash: string) {
  return timingSafeEqual(await hashOTP(email, code), hash)
}
