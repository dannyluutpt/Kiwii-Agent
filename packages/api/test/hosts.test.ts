import { describe, expect, test } from "bun:test"
import worker from "../src/index"

// The app at amberpix.com, having moved from kiwiiagent.com.
const env = {
  APP_URL: "https://amberpix.com",
  MOVED_FROM: "kiwiiagent.com www.kiwiiagent.com",
  DB: {},
  RL_IP: { limit: async () => ({ success: true }) },
  ASSETS: { fetch: async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }) },
}
const get = (url: string) => worker.fetch(new Request(url), env)

describe("hosts", () => {
  test("a page on the old domain moves to the same address on the new one", async () => {
    for (const host of ["kiwiiagent.com", "www.kiwiiagent.com"]) {
      const res = await get(`https://${host}/p/01ABC?prompt=a`)
      expect(res.status).toBe(301)
      expect(res.headers.get("location")).toBe("https://amberpix.com/p/01ABC?prompt=a")
    }
  })

  test("the old domain's API keeps answering, for payment webhooks and pages opened before the move", async () => {
    const res = await get("https://kiwiiagent.com/api/health")
    expect(res.status).toBe(200)
  })

  test("www and workers.dev lead to the apex", async () => {
    for (const host of ["www.amberpix.com", "kiwii-agent.someone.workers.dev"]) {
      const res = await get(`https://${host}/pricing`)
      expect(res.status).toBe(301)
      expect(res.headers.get("location")).toBe("https://amberpix.com/pricing")
    }
  })

  test("the new domain serves the app", async () => {
    const res = await get("https://amberpix.com/")
    expect(res.status).toBe(200)
    expect(res.headers.get("content-security-policy")).toContain("default-src 'self'")
  })

  test("while the old domain is still the app's address, it serves the app and the new one does too", async () => {
    const before = { ...env, APP_URL: "https://kiwiiagent.com" }
    expect((await worker.fetch(new Request("https://kiwiiagent.com/"), before)).status).toBe(200)
    expect((await worker.fetch(new Request("https://amberpix.com/"), before)).status).toBe(200)
  })
})
