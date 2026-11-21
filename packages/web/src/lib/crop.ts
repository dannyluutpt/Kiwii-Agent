// A square cut out of a photo, for a close-up of a face. A model keeps a face far better from a
// picture the face fills than from a full-length shot where it is a few hundred pixels wide.

// Where the square sits: its centre as fractions of the photo's width and height, and its side as a
// fraction of the photo's shorter edge.
export type Square = { x: number; y: number; size: number }

export const MIN_SQUARE = 0.15
// Head and shoulders in an upright full-length photo: high and centred, a little under half the width.
export const FACE_GUESS: Square = { x: 0.5, y: 0.25, size: 0.45 }

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value))

// The same square kept inside the photo: no smaller than is useful, no larger than the photo, and
// moved back in when it hangs over an edge.
export function keepInside(square: Square, width: number, height: number): Square {
  const size = clamp(square.size, MIN_SQUARE, 1)
  const side = size * Math.min(width, height)
  const halfX = side / width / 2
  const halfY = side / height / 2
  return { x: clamp(square.x, halfX, 1 - halfX), y: clamp(square.y, halfY, 1 - halfY), size }
}

// The square in whole pixels of the photo.
export function squarePixels(square: Square, width: number, height: number) {
  const kept = keepInside(square, width, height)
  const side = Math.max(1, Math.round(kept.size * Math.min(width, height)))
  return {
    left: clamp(Math.round(kept.x * width - side / 2), 0, width - side),
    top: clamp(Math.round(kept.y * height - side / 2), 0, height - side),
    side,
  }
}

// The square as a JPEG file. Undefined when the browser cannot read the picture.
export async function cropSquare(source: Blob, square: Square, name: string) {
  const bitmap = await createImageBitmap(source).catch(() => undefined)
  if (!bitmap) return undefined
  const box = squarePixels(square, bitmap.width, bitmap.height)
  const canvas = document.createElement("canvas")
  canvas.width = box.side
  canvas.height = box.side
  const context = canvas.getContext("2d")
  if (!context) {
    bitmap.close()
    return undefined
  }
  context.fillStyle = "#fff"
  context.fillRect(0, 0, box.side, box.side)
  context.drawImage(bitmap, box.left, box.top, box.side, box.side, 0, 0, box.side, box.side)
  bitmap.close()
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92))
  return blob ? new File([blob], name, { type: "image/jpeg" }) : undefined
}
