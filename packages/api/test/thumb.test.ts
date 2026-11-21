import { describe, expect, test } from "bun:test"
import { thumb, thumbKey, thumbKeys, thumbWidth } from "../src/images/thumb"

// R2 as a map, and Cloudflare Images as something that counts what it is asked to transform.
function fakes() {
  const store = new Map<string, Uint8Array>([["u/a/1.png", new Uint8Array([1, 2, 3])]])
  const bucket = {
    get: async (key: string) => {
      const bytes = store.get(key)
      return bytes ? { body: bytes } : null
    },
    put: async (key: string, bytes: ArrayBuffer) => void store.set(key, new Uint8Array(bytes)),
  } as unknown as R2Bucket
  const made: number[] = []
  const images = {
    input: () => ({
      transform: (options: { width: number }) => ({
        output: async () => {
          made.push(options.width)
          return { response: () => new Response(new Uint8Array([9])) }
        },
      }),
    }),
  } as unknown as ImagesBinding
  return { store, bucket, images, made }
}

describe("small copies of a picture", () => {
  test("only the two widths are served", () => {
    expect(thumbWidth("480")).toBe(480)
    expect(thumbWidth("960")).toBe(960)
    expect(thumbWidth("481")).toBeUndefined()
    expect(thumbWidth(undefined)).toBeUndefined()
  })

  test("a copy is made once and kept, outside the folder the orphan sweep walks", async () => {
    const { store, bucket, images, made } = fakes()
    expect(await thumb(images, bucket, "u/a/1.png", 480)).toBeDefined()
    expect(await thumb(images, bucket, "u/a/1.png", 480)).toBeDefined()
    expect(made).toEqual([480])
    expect(store.has(thumbKey("u/a/1.png", 480))).toBe(true)
    expect(thumbKeys("u/a/1.png").every((key) => !key.startsWith("u/"))).toBe(true)
  })

  test("without the binding, or for a picture that is gone, there is no copy and the caller serves the original", async () => {
    const { bucket, images } = fakes()
    expect(await thumb(undefined, bucket, "u/a/1.png", 480)).toBeUndefined()
    expect(await thumb(images, bucket, "u/a/gone.png", 480)).toBeUndefined()
  })
})
