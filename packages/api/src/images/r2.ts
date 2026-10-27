import { ulid } from "ulid"

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"])

export function extensionFor(mime: string) {
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  return "jpg"
}

export function objectKey(userID: string, mime: string) {
  return `u/${userID}/${ulid()}.${extensionFor(mime)}`
}

export async function putObject(bucket: R2Bucket, key: string, bytes: Uint8Array | ArrayBuffer, mime: string) {
  await bucket.put(key, bytes, { httpMetadata: { contentType: mime } })
}

export async function toDataURL(bucket: R2Bucket, key: string) {
  const object = await bucket.get(key)
  if (!object) return undefined
  const mime = object.httpMetadata?.contentType ?? "image/jpeg"
  const bytes = new Uint8Array(await object.arrayBuffer())
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${mime};base64,${btoa(binary)}`
}
