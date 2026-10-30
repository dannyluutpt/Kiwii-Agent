import { dataURL } from "./r2"

// Enough for the screening and rewrite to tell what is in a picture; the full picture would cost far
// more tokens and upload time on every run.
const GLANCE_EDGE = 768

// A small JPEG copy of a picture in R2, as a data URL for a language model to look at, or, at a
// larger edge and quality, for a video model to start a clip from.
export async function glance(images: ImagesBinding, bucket: R2Bucket, key: string, edge = GLANCE_EDGE) {
  const object = await bucket.get(key)
  if (!object) throw new Error(`no picture at ${key}`)
  const small = await images
    .input(object.body)
    .transform({ width: edge, height: edge, fit: "scale-down" })
    // A cut-out product reads as standing on white, the way it would be shown.
    .output({ format: "image/jpeg", quality: edge > GLANCE_EDGE ? 90 : 80, background: "#ffffff" })
  return dataURL("image/jpeg", new Uint8Array(await small.response().arrayBuffer()))
}

// The largest area of a `width` × `height` picture in the shape of `ratio`, around its middle, then
// scaled down so its long side is at most `edge`. Never larger than the picture itself.
export function cropBox(width: number, height: number, ratio: string, edge: number) {
  const [w = 1, h = 1] = ratio.split(":").map(Number)
  const wide = width / height > w / h
  const box = wide ? { width: (height * w) / h, height } : { width, height: (width * h) / w }
  const scale = Math.min(1, edge / Math.max(box.width, box.height))
  return { width: Math.round(box.width * scale), height: Math.round(box.height * scale) }
}

// A picture a clip starts or ends on, cut to the clip's frame around its middle, as a JPEG data
// URL. A clip's two frames then have the same shape as the clip, whatever was uploaded.
export async function framed(images: ImagesBinding, bucket: R2Bucket, key: string, ratio: string, edge: number) {
  const object = await bucket.get(key)
  if (!object) throw new Error(`no picture at ${key}`)
  const bytes = new Uint8Array(await object.arrayBuffer())
  const info = await images.info(new Blob([bytes]).stream())
  if (!("width" in info)) throw new Error(`no size for ${key}`)
  const box = cropBox(info.width, info.height, ratio, edge)
  const cut = await images
    .input(new Blob([bytes]).stream())
    .transform({ width: box.width, height: box.height, fit: "cover" })
    .output({ format: "image/jpeg", quality: 90, background: "#ffffff" })
  return dataURL("image/jpeg", new Uint8Array(await cut.response().arrayBuffer()))
}
