// Phone cameras shoot 12 to 50 megapixels, more than the image models take as a reference (FLUX
// refuses anything over 20 MP) and slow to upload. Pictures are scaled down in the browser first,
// the long edge to each model's limit, and re-encoded as JPEG without their metadata.

export type Fitted = { file: File; width: number; height: number }

// The size a picture should be drawn at so its long edge fits `max`; smaller pictures keep theirs.
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

// Returns a PNG or WebP that is already small enough as it is (keeping any transparency), or a JPEG
// copy drawn at the size that fits, with the same name. A JPEG is drawn again even when it fits: a
// phone keeps the photo's rotation in an EXIF tag that some image models ignore, and the place it
// was taken in the same metadata. Drawing bakes the rotation into the pixels and leaves the metadata
// behind. A picture the browser cannot decode goes up as it is (the server then decides), with its
// size unknown (0 × 0).
export async function shrinkImage(file: File, max: number): Promise<Fitted> {
  const bitmap = await createImageBitmap(file).catch(() => undefined)
  if (!bitmap) return { file, width: 0, height: 0 }
  const natural = { width: bitmap.width, height: bitmap.height }
  const size = fitWithin(natural.width, natural.height, max)
  const fits = size.width === natural.width && size.height === natural.height
  const context = fits && file.type !== "image/jpeg" ? null : canvasFor(size)
  if (!context) {
    bitmap.close()
    return { file, ...natural }
  }
  // JPEG has no transparency; a white backdrop keeps see-through areas from turning black.
  context.fillStyle = "#fff"
  context.fillRect(0, 0, size.width, size.height)
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => context.canvas.toBlob(resolve, "image/jpeg", 0.9))
  if (!blob) return { file, ...natural }
  return { file: new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }), ...size }
}

function canvasFor(size: { width: number; height: number }) {
  const canvas = document.createElement("canvas")
  canvas.width = size.width
  canvas.height = size.height
  return canvas.getContext("2d")
}
