import { describe, expect, test } from "bun:test"
import { testSite } from "./d1"

const message = { email: "Khach@Example.com", message: "Tôi chuyển khoản hai lần cho đơn KWABCDEFGH, nhờ hoàn giúp." }

describe("the support form", () => {
  test("a message reaches the owner's inbox with the sender's address in it", async () => {
    const site = await testSite()
    site.sqlite.run(`insert into app_config (key, value, updated_at) values ('admin_email', 'owner@example.com', 1)`)
    expect((await site.post("/api/support", message)).status).toBe(200)
    expect(site.outbox.at(-1)).toMatchObject({ to: "owner@example.com" })
    expect(site.outbox.at(-1)?.text).toContain("khach@example.com")
    expect(site.outbox.at(-1)?.text).toContain("KWABCDEFGH")
  })

  test("five a day from one address, then it waits for tomorrow", async () => {
    const site = await testSite()
    site.sqlite.run(`insert into app_config (key, value, updated_at) values ('admin_email', 'owner@example.com', 1)`)
    for (const _ of [1, 2, 3, 4, 5]) expect((await site.post("/api/support", message)).status).toBe(200)
    expect((await site.post("/api/support", message)).status).toBe(429)
    expect(site.outbox).toHaveLength(5)
  })

  test("a message too short to mean anything, or with no address to answer, is refused", async () => {
    const site = await testSite()
    expect((await site.post("/api/support", { ...message, message: "hi" })).status).toBe(400)
    expect((await site.post("/api/support", { ...message, email: "not-an-address" })).status).toBe(400)
  })

  test("with no inbox set the form says so instead of dropping the message", async () => {
    const site = await testSite()
    const res = await site.post("/api/support", message)
    expect(res.status).toBe(500)
    expect(await res.json()).toMatchObject({ error: { code: "SUPPORT_NOT_CONFIGURED" } })
  })
})
