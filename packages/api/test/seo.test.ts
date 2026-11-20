import { describe, expect, test } from "bun:test"
import worker from "../src/index"

const SHELL = `<!doctype html><html><head><title>Amberpix</title><meta name="description" content="old" /><meta property="og:title" content="old" /><meta property="og:description" content="old" /></head><body></body></html>`
const env = {
  APP_URL: "https://amberpix.com",
  DB: {},
  RL_IP: { limit: async () => ({ success: true }) },
  ASSETS: { fetch: async () => new Response(SHELL, { headers: { "content-type": "text/html" } }) },
}
const page = async (path: string) => (await worker.fetch(new Request(`https://amberpix.com${path}`), env)).text()

describe("what search engines and link previews read", () => {
  test("the home page and the prices have their own title, description and canonical address", async () => {
    const home = await page("/")
    expect(home).toContain("<title>Amberpix: tạo ảnh và video AI bằng tiếng Việt</title>")
    expect(home).toContain('<link rel="canonical" href="https://amberpix.com/" />')
    expect(home).not.toContain("noindex")
    const prices = await page("/pricing?utm_source=fb")
    expect(prices).toContain("<title>Bảng giá Amberpix")
    expect(prices).toContain('<link rel="canonical" href="https://amberpix.com/pricing" />')
    expect(prices).toContain('<meta property="og:url" content="https://amberpix.com/pricing" />')
    expect(prices).not.toContain('content="old"')
  })

  test("screens behind the sign-in and addresses that are no page are kept out of the index", async () => {
    for (const path of ["/library", "/login", "/p/01ABC", "/no-such-page"]) {
      const html = await page(path)
      expect(html).toContain('<meta name="robots" content="noindex" />')
      expect(html).not.toContain("canonical")
    }
  })
})
