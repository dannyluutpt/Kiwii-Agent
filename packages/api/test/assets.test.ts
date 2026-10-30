import { describe, expect, test } from "bun:test"
import worker from "../src/index"

// A ten-byte clip in the website's files, as the assets binding sends it: always whole.
const CLIP = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
const env = {
  APP_URL: "https://amberpix.com",
  DB: {},
  RL_IP: { limit: async () => ({ success: true }) },
  ASSETS: { fetch: async () => new Response(CLIP, { headers: { "content-type": "video/mp4" } }) },
}
const get = (range?: string) =>
  worker.fetch(
    new Request("https://amberpix.com/showcase/clips/quan-pho.mp4", { headers: range ? { range } : {} }),
    env,
  )

describe("a sample clip on the website", () => {
  test("answers the byte range Safari asks for before it plays", async () => {
    const res = await get("bytes=0-1")
    expect(res.status).toBe(206)
    expect(res.headers.get("content-range")).toBe("bytes 0-1/10")
    expect(res.headers.get("accept-ranges")).toBe("bytes")
    expect(res.headers.get("content-type")).toBe("video/mp4")
    expect([...new Uint8Array(await res.arrayBuffer())]).toEqual([0, 1])
  })

  test("reads an open-ended range, a range from the end, and one that runs past the end", async () => {
    expect([...new Uint8Array(await (await get("bytes=7-")).arrayBuffer())]).toEqual([7, 8, 9])
    expect([...new Uint8Array(await (await get("bytes=-2")).arrayBuffer())]).toEqual([8, 9])
    const past = await get("bytes=8-50")
    expect(past.headers.get("content-range")).toBe("bytes 8-9/10")
    expect([...new Uint8Array(await past.arrayBuffer())]).toEqual([8, 9])
  })

  test("refuses a range that starts after the end, and sends the whole file without a range", async () => {
    const after = await get("bytes=20-30")
    expect(after.status).toBe(416)
    expect(after.headers.get("content-range")).toBe("bytes */10")
    const whole = await get()
    expect(whole.status).toBe(200)
    expect(new Uint8Array(await whole.arrayBuffer()).length).toBe(10)
    // Several ranges at once are not read; the whole file is a valid answer to them.
    expect((await get("bytes=0-1,4-5")).status).toBe(200)
  })
})
