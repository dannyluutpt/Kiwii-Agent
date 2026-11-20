import { describe, expect, test } from "bun:test"
import { testSite } from "./d1"

const KEY = "sepay-key"
const EMAIL = "an@example.com"

type Site = Awaited<ReturnType<typeof testSite>>
type Order = { id: string; memo: string; amountVnd: number; status: string }

async function customer(site: Site) {
  await site.post("/api/auth/signup", { email: EMAIL, password: "mat-khau-dai" })
  const code = /Mã của bạn: (\d+)/.exec(site.outbox.at(-1)?.text ?? "")?.[1]
  await site.post("/api/auth/signup/verify", { email: EMAIL, code })
  return (await (await site.post("/api/billing/orders", { kind: "plan", id: "starter" })).json()) as Order
}

const transfer = (site: Site, body: Record<string, unknown>, key = KEY) =>
  site.visitor().post("/api/billing/webhook/sepay", body, { authorization: `Apikey ${key}` })

const paid = (order: Order, id: number, amount = order.amountVnd) => ({
  id,
  transferType: "in",
  transferAmount: amount,
  content: `CK ${order.memo.toLowerCase()} cam on`,
})

const me = async (site: Site) => (await (await site.get("/api/auth/me")).json()) as { tier: string; credits: number }
const status = async (site: Site, order: Order) =>
  ((await (await site.get(`/api/billing/orders/${order.id}`)).json()) as Order).status

const settings = { SEPAY_API_KEY: KEY, SEPAY_BANK_ACCOUNT: "1", SEPAY_BANK_CODE: "ACB" }

describe("SePay webhook", () => {
  test("a transfer with the memo activates the plan once, however often it is delivered", async () => {
    const site = await testSite(settings)
    const order = await customer(site)
    expect(await (await transfer(site, paid(order, 1))).json()).toEqual({ ok: true, activated: true })
    expect(await (await transfer(site, paid(order, 1))).json()).toEqual({ ok: true, duplicate: true })
    // The customer pays the same memo a second time: recorded, nothing granted again.
    expect(await (await transfer(site, paid(order, 2))).json()).toEqual({ ok: true, ignored: "order paid" })
    expect(await me(site)).toMatchObject({ tier: "starter", credits: 3 + 180 })
    expect(await status(site, order)).toBe("paid")
  })

  test("a wrong key, a missing key and a body that is not JSON are refused", async () => {
    const site = await testSite(settings)
    const order = await customer(site)
    expect((await transfer(site, paid(order, 1), "guess")).status).toBe(401)
    expect((await site.visitor().post("/api/billing/webhook/sepay", paid(order, 1))).status).toBe(401)
    expect((await transfer(site, "not json" as never)).status).toBe(400)
    expect(await me(site)).toMatchObject({ tier: "free" })
  })

  test("too little money waits for a person; money going out and unknown memos are ignored", async () => {
    const site = await testSite(settings)
    const order = await customer(site)
    expect(await (await transfer(site, { ...paid(order, 1), transferType: "out" })).json()).toMatchObject({
      ignored: "outgoing",
    })
    expect(await (await transfer(site, { ...paid(order, 2), content: "KWAAAAAAAA" })).json()).toMatchObject({
      ignored: "no matching order",
    })
    expect(await (await transfer(site, paid(order, 3, order.amountVnd - 1))).json()).toMatchObject({
      review: "amount below order",
    })
    expect(await status(site, order)).toBe("pending_review")
    expect(await me(site)).toMatchObject({ tier: "free", credits: 3 })
  })

  test("a transfer that lands after the order's day ran out still counts", async () => {
    const site = await testSite(settings)
    const order = await customer(site)
    site.sqlite.run("update plan_orders set status = 'expired', expires_at = 1")
    expect(await (await transfer(site, paid(order, 1))).json()).toEqual({ ok: true, activated: true })
    expect(await me(site)).toMatchObject({ tier: "starter", credits: 3 + 180 })
  })

  test("an activation that fails halfway grants nothing and goes through on SePay's retry", async () => {
    const site = await testSite(settings)
    const order = await customer(site)
    // The last write of the batch cannot land: the plan and the credits written before it must come
    // undone with it.
    site.sqlite.run("alter table plan_events rename to plan_events_away")
    expect((await transfer(site, paid(order, 1))).status).toBe(500)
    site.sqlite.run("alter table plan_events_away rename to plan_events")
    expect(await status(site, order)).toBe("pending")
    expect(await me(site)).toMatchObject({ tier: "free", credits: 3 })
    expect(await (await transfer(site, paid(order, 1))).json()).toEqual({ ok: true, activated: true })
    expect(await me(site)).toMatchObject({ tier: "starter", credits: 3 + 180 })
  })
})
