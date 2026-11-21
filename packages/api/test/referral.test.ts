import { describe, expect, test } from "bun:test"
import { testSite } from "./d1"

const KEY = "sepay-key"
const settings = { SEPAY_API_KEY: KEY, SEPAY_BANK_ACCOUNT: "1", SEPAY_BANK_CODE: "ACB" }

type Site = Awaited<ReturnType<typeof testSite>>
type Visitor = ReturnType<Site["visitor"]>
type Order = { id: string; memo: string; amountVnd: number }
type Referral = { code: string; link: string; invited: number; paid: number; credits: number }

async function signUp(site: Site, visitor: Visitor, email: string, ref?: string) {
  await visitor.post("/api/auth/signup", { email, password: "mat-khau-dai", ref })
  const code = /Mã của bạn: (\d+)/.exec(site.outbox.at(-1)?.text ?? "")?.[1]
  expect((await visitor.post("/api/auth/signup/verify", { email, code })).status).toBe(200)
}

let transfers = 0
async function buy(site: Site, visitor: Visitor, plan: string) {
  const order = (await (await visitor.post("/api/billing/orders", { kind: "plan", id: plan })).json()) as Order
  const res = await site
    .visitor()
    .post(
      "/api/billing/webhook/sepay",
      { id: ++transfers, transferType: "in", transferAmount: order.amountVnd, content: order.memo },
      { authorization: `Apikey ${KEY}` },
    )
  expect(await res.json()).toEqual({ ok: true, activated: true })
}

const credits = async (visitor: Visitor) =>
  ((await (await visitor.get("/api/auth/me")).json()) as { credits: number }).credits
const referral = async (visitor: Visitor) => (await (await visitor.get("/api/account/referral")).json()) as Referral

describe("referrals", () => {
  test("an invited account's first plan gives credits to both, once", async () => {
    const site = await testSite(settings)
    const host = site.visitor()
    const friend = site.visitor()
    await signUp(site, host, "host@example.com")
    const shared = await referral(host)
    expect(shared.code).toMatch(/^[A-Z2-9]{8}$/)
    expect(shared.link).toBe(`https://amberpix.com/?ref=${shared.code}`)
    expect((await referral(host)).code).toBe(shared.code)

    // Typed in lower case, as a link pasted through a chat app may arrive.
    await signUp(site, friend, "friend@example.com", shared.code.toLowerCase())
    expect(await referral(host)).toMatchObject({ invited: 1, paid: 0, credits: 0 })
    expect(await credits(host)).toBe(3)

    await buy(site, friend, "starter")
    expect(await credits(friend)).toBe(3 + 180 + 20)
    expect(await credits(host)).toBe(3 + 30)
    expect(await referral(host)).toMatchObject({ invited: 1, paid: 1, credits: 30 })

    await buy(site, friend, "starter")
    expect(await credits(friend)).toBe(3 + 180 + 20 + 180)
    expect(await credits(host)).toBe(3 + 30)
  })

  test("a code that is nobody's is ignored, and an account nobody invited earns nobody anything", async () => {
    const site = await testSite(settings)
    const alone = site.visitor()
    await signUp(site, alone, "alone@example.com", "NOTACODE")
    await buy(site, alone, "starter")
    expect(await credits(alone)).toBe(3 + 180)
  })

  test("the amounts follow app_config, and 0 turns a side off", async () => {
    const site = await testSite(settings)
    site.sqlite.run(
      `insert into app_config (key, value, updated_at) values ('referral', '{"referrer":50,"friend":0}', 1)`,
    )
    const host = site.visitor()
    const friend = site.visitor()
    await signUp(site, host, "host@example.com")
    await signUp(site, friend, "friend@example.com", (await referral(host)).code)
    await buy(site, friend, "plus")
    expect(await credits(friend)).toBe(3 + 750)
    expect(await credits(host)).toBe(3 + 50)
  })
})
