// A sheet is one picture laid out in panels. These read a small gray copy of it to find where the
// panels meet, then cut each panel out of the full picture.

export type Box = { left: number; top: number; width: number; height: number }
export type Gray = { width: number; height: number; pixels: Uint8Array }

// Rows the copies are squeezed to: the columns keep every edge sharp while each row averages a band
// of the picture, which is all finding a panel edge that runs top to bottom needs.
export const SQUEEZED_ROWS = 128

// The picture as gray levels, stretched or squeezed to `size`.
export async function grayCopy(images: ImagesBinding, bytes: Uint8Array, size: { width: number; height: number }) {
  const copy = await images
    .input(new Blob([bytes]).stream())
    .transform({ width: size.width, height: size.height, fit: "squeeze" })
    .output({ format: "image/png" })
  return grayPNG(new Uint8Array(await copy.response().arrayBuffer()))
}

// One panel of the picture, as a JPEG of its own.
export async function cutPanel(
  images: ImagesBinding,
  bytes: Uint8Array,
  picture: { width: number; height: number },
  box: Box,
) {
  const cut = await images
    .input(new Blob([bytes]).stream())
    .transform({
      trim: {
        left: box.left,
        top: box.top,
        right: picture.width - box.left - box.width,
        bottom: picture.height - box.top - box.height,
      },
    })
    .output({ format: "image/jpeg", quality: 92 })
  return new Uint8Array(await cut.response().arrayBuffer())
}

// Channels per pixel for each PNG colour type: gray, RGB, palette, gray with alpha, RGBA.
const CHANNELS = new Map([
  [0, 1],
  [2, 3],
  [3, 1],
  [4, 2],
  [6, 4],
])

// A PNG's pixels as gray levels, row by row. Reads what the Images binding writes: eight bits a
// channel, not interlaced.
export async function grayPNG(png: Uint8Array): Promise<Gray> {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
  const chunks: Array<{ name: string; body: Uint8Array }> = []
  for (let at = 8; at + 8 <= png.length; at += 12 + view.getUint32(at)) {
    chunks.push({
      name: String.fromCharCode(...png.subarray(at + 4, at + 8)),
      body: png.subarray(at + 8, at + 8 + view.getUint32(at)),
    })
  }
  const header = chunks.find((chunk) => chunk.name === "IHDR")?.body ?? new Uint8Array(13)
  const fields = new DataView(header.buffer, header.byteOffset, header.byteLength)
  const width = fields.getUint32(0)
  const height = fields.getUint32(4)
  const type = header[9] ?? 0
  const channels = CHANNELS.get(type) ?? 0
  const stride = width * channels
  const raw = new Uint8Array(
    await new Response(
      new Blob(chunks.filter((chunk) => chunk.name === "IDAT").map((chunk) => chunk.body))
        .stream()
        .pipeThrough(new DecompressionStream("deflate")),
    ).arrayBuffer(),
  )
  if (channels === 0 || header[8] !== 8 || header[12] !== 0 || raw.length < height * (stride + 1)) {
    throw new Error(`unsupported PNG: type ${type}, depth ${header[8]}, interlace ${header[12]}, ${raw.length} bytes`)
  }
  const pixels = new Uint8Array(stride * height)
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)] ?? 0
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x
      const left = x >= channels ? (pixels[at - channels] ?? 0) : 0
      const up = y > 0 ? (pixels[at - stride] ?? 0) : 0
      const corner = x >= channels && y > 0 ? (pixels[at - stride - channels] ?? 0) : 0
      pixels[at] = ((raw[y * (stride + 1) + 1 + x] ?? 0) + predict(filter, left, up, corner)) & 255
    }
  }
  const palette = chunks.find((chunk) => chunk.name === "PLTE")?.body ?? new Uint8Array()
  const gray = new Uint8Array(width * height)
  for (let i = 0; i < gray.length; i++) {
    const at = i * channels
    const index = (pixels[at] ?? 0) * 3
    const color =
      type === 3 ? palette.subarray(index, index + 3) : channels >= 3 ? pixels.subarray(at, at + 3) : undefined
    gray[i] = color
      ? Math.round(0.299 * (color[0] ?? 0) + 0.587 * (color[1] ?? 0) + 0.114 * (color[2] ?? 0))
      : (pixels[at] ?? 0)
  }
  return { width, height, pixels: gray }
}

// What a PNG row filter adds back to each byte, from the bytes to its left, above, and above left.
function predict(filter: number, left: number, up: number, corner: number) {
  if (filter === 1) return left
  if (filter === 2) return up
  if (filter === 3) return (left + up) >> 1
  if (filter !== 4) return 0
  const guess = left + up - corner
  const toLeft = Math.abs(guess - left)
  const toUp = Math.abs(guess - up)
  const toCorner = Math.abs(guess - corner)
  if (toLeft <= toUp && toLeft <= toCorner) return left
  return toUp <= toCorner ? up : corner
}
