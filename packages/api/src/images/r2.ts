import { ulid } from "ulid"

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const IMAGE_MIMES = new Set(["image/jpeg", "image/png", "image/webp"])

export function extensionFor(mime: string) {
  if (mime === "image/png") return "png"
  if (mime === "image/webp") return "webp"
  if (mime === "video/mp4") return "mp4"
  return "jpg"
}

export function objectKey(userID: string, mime: string, id = ulid()) {
  return `u/${userID}/${id}.${extensionFor(mime)}`
}

export async function putObject(bucket: R2Bucket, key: string, bytes: Uint8Array | ArrayBuffer, mime: string) {
  await bucket.put(key, bytes, { httpMetadata: { contentType: mime } })
}

export async function toDataURL(bucket: R2Bucket, key: string) {
  const object = await bucket.get(key)
  if (!object) return undefined
  return dataURL(object.httpMetadata?.contentType ?? "image/jpeg", new Uint8Array(await object.arrayBuffer()))
}

export function dataURL(mime: string, bytes: Uint8Array) {
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return `data:${mime};base64,${btoa(binary)}`
}

// The bytes R2 served for a range request, or undefined when it served the whole object. The local
// R2 names all three fields and leaves the unused ones undefined.
export function byteSpan(range: R2Range | undefined, size: number) {
  if (!range) return undefined
  const suffix = "suffix" in range ? range.suffix : undefined
  if (suffix !== undefined) return { start: Math.max(0, size - suffix), end: size - 1 }
  const offset = "offset" in range ? range.offset : undefined
  const length = "length" in range ? range.length : undefined
  const start = offset ?? 0
  const end = length === undefined ? size - 1 : Math.min(size - 1, start + length - 1)
  if (start === 0 && end === size - 1) return undefined
  return { start, end }
}
