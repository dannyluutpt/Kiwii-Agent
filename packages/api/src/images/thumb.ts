// Widths a picture is served at besides its own. A gallery tile asks for one of these instead of the
// full picture, which is several megabytes at 4K.
export const THUMB_WIDTHS = [480, 960] as const
export type ThumbWidth = (typeof THUMB_WIDTHS)[number]

export function thumbWidth(value: string | undefined): ThumbWidth | undefined {
  return THUMB_WIDTHS.find((width) => String(width) === value)
}

// Where a picture's small copy is kept. Outside "u/", so the sweep of pictures without a files row
// (cleanup.ts) never takes it for one; it is removed with its picture instead.
export function thumbKey(key: string, width: ThumbWidth) {
  return `t/${width}/${key}`
}

export const thumbKeys = (key: string) => THUMB_WIDTHS.map((width) => thumbKey(key, width))

// The small WebP copy of a picture, made on first ask and kept in R2: Cloudflare Images bills each
// transformation, so a picture is transformed once per width, however often it is looked at.
// Undefined when it cannot be made (no binding, the picture is gone, the transformation failed): the
// caller serves the picture itself.
export async function thumb(images: ImagesBinding | undefined, bucket: R2Bucket, key: string, width: ThumbWidth) {
  const kept = await bucket.get(thumbKey(key, width))
  if (kept) return kept.body
  if (!images) return undefined
  const object = await bucket.get(key)
  if (!object) return undefined
  const bytes = await images
    .input(object.body)
    .transform({ width, fit: "scale-down" })
    .output({ format: "image/webp", quality: 82 })
    .then((made) => made.response().arrayBuffer())
    .catch((error: unknown) => {
      console.warn(`[thumb] ${key} at ${width}: ${String(error)}`)
      return undefined
    })
  if (!bytes) return undefined
  await bucket.put(thumbKey(key, width), bytes, { httpMetadata: { contentType: "image/webp" } })
  return bytes
}
