import { describe, expect, test } from "bun:test"
import worker from "../src/index"

// A limiter whose budget is already spent, as after a gallery's worth of requests from one address.
const env = { APP_URL: "http://localhost", DB: {}, RL_IP: { limit: async () => ({ success: false }) } }
const get = (path: string) => worker.fetch(new Request(`http://localhost${path}`), env)

describe("per-IP limit", () => {
  test("a spent budget blocks the API", async () => {
    const res = await get("/api/auth/config")
    expect(res.status).toBe(429)
  })

  test("picture downloads skip it and still need a session", async () => {
    const res = await get("/api/images/files/01ABCDEF")
    expect(res.status).toBe(401)
  })
})
