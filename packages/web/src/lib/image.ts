// Phone cameras shoot 12 to 50 megapixels, more than the image models take as a reference (FLUX
// refuses anything over 20 MP) and slow to upload. Pictures are scaled down in the browser first,
// the long edge to each model's limit, and re-encoded as JPEG.

export type Fitted = { file: File; width: number; height: number }

// The size a picture should be drawn at so its long edge fits `max`; smaller pictures keep theirs.
export function fitWithin(width: number, height: number, max: number) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

// Returns the picture itself when it is already small enough, or a scaled-down JPEG copy with the
// same name. A picture the browser cannot decode goes up as it is (the server then decides), with
// its size unknown (0 × 0).
export async function shrinkImage(file: File, max: number): Promise<Fitted> {
  const bitmap = await createImageBitmap(file).catch(() => undefined)
  if (!bitmap) return { file, width: 0, height: 0 }
  const size = fitWithin(bitmap.width, bitmap.height, max)
  if (size.width === bitmap.width && size.height === bitmap.height) {
    bitmap.close()
    return { file, ...size }
  }
  const canvas = document.createElement("canvas")
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext("2d")
  if (!context) {
    bitmap.close()
    return { file, width: bitmap.width, height: bitmap.height }
  }
  // JPEG has no transparency; a white backdrop keeps see-through areas from turning black.
  context.fillStyle = "#fff"
  context.fillRect(0, 0, size.width, size.height)
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9))
  if (!blob) return { file, width: bitmap.width, height: bitmap.height }
  return { file: new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }), ...size }
}
