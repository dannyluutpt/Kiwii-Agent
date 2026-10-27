const encoder = new TextEncoder()

export function toHex(bytes: ArrayBuffer | Uint8Array) {
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, "0")).join("")
}

export function fromHex(hex: string) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

export function toBase64Url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "")
}

export function randomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length))
}

export async function sha256Hex(input: string) {
  return toHex(await crypto.subtle.digest("SHA-256", encoder.encode(input)))
}

export async function hmacHex(secret: string, input: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
  ])
  return toHex(await crypto.subtle.sign("HMAC", key, encoder.encode(input)))
}

// Compares two strings in constant time to avoid leaking where they diverge. Written by hand
// because `crypto.subtle.timingSafeEqual` exists on Workers but not in Bun's test runtime.
export function timingSafeEqual(a: string, b: string) {
  const x = encoder.encode(a)
  const y = encoder.encode(b)
  if (x.byteLength !== y.byteLength) return false
  let diff = 0
  for (let i = 0; i < x.byteLength; i++) diff |= x[i]! ^ y[i]!
  return diff === 0
}
