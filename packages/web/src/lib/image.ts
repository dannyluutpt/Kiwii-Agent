// Phone cameras shoot 12 to 50 megapixels, more than the image models accept as a reference (FLUX
// refuses anything over 20 MP) and slow to upload. Pictures are scaled down in the browser first:
// the long edge to at most this many pixels, re-encoded as JPEG.
export const MAX_REFERENCE_EDGE = 2048

// The size a picture should be drawn at so its long edge fits `max`; smaller pictures keep theirs.
export function fitWithin(width: number, height: number, max = MAX_REFERENCE_EDGE) {
  const scale = Math.min(1, max / Math.max(width, height))
  return { width: Math.round(width * scale), height: Math.round(height * scale) }
}

// Returns the file itself when it is already small enough or the browser cannot decode it (the
// server then decides), otherwise a scaled-down JPEG copy with the same name.
export async function shrinkImage(file: File, max = MAX_REFERENCE_EDGE): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => undefined)
  if (!bitmap) return file
  const size = fitWithin(bitmap.width, bitmap.height, max)
  if (size.width === bitmap.width && size.height === bitmap.height) {
    bitmap.close()
    return file
  }
  const canvas = document.createElement("canvas")
  canvas.width = size.width
  canvas.height = size.height
  const context = canvas.getContext("2d")
  if (!context) {
    bitmap.close()
    return file
  }
  // JPEG has no transparency; a white backdrop keeps see-through areas from turning black.
  context.fillStyle = "#fff"
  context.fillRect(0, 0, size.width, size.height)
  context.drawImage(bitmap, 0, 0, size.width, size.height)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.9))
  if (!blob) return file
  return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" })
}
