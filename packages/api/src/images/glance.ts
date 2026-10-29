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
