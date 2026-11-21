import { describe, expect, test } from "bun:test"
import { createDatabase } from "../src/db/client"
import { sendWeeklyReport, weeklyNumbers, weeklyReportText } from "../src/report"
import { testSite } from "./d1"

const KEY = "sepay-key"
const settings = { SEPAY_API_KEY: KEY, SEPAY_BANK_ACCOUNT: "1", SEPAY_BANK_CODE: "ACB" }
// A Monday and a Tuesday, at 00:00 in Vietnam, when the daily cron runs.
const MONDAY = Date.UTC(2026, 10, 22, 17)
const TUESDAY = Date.UTC(2026, 10, 23, 17)

type Site = Awaited<ReturnType<typeof testSite>>

async function customerWithOrder(site: Site) {
  await site.post("/api/auth/signup", { email: "an@example.com", password: "mat-khau-dai" })
  const code = /Mã của bạn: (\d+)/.exec(site.outbox.at(-1)?.text ?? "")?.[1]
  await site.post("/api/auth/signup/verify", { email: "an@example.com", code })
  return (await (await site.post("/api/billing/orders", { kind: "plan", id: "starter" })).json()) as {
    memo: string
    amountVnd: number
  }
}

const transfer = (site: Site, body: Record<string, unknown>) =>
  site.visitor().post("/api/billing/webhook/sepay", body, { authorization: `Apikey ${KEY}` })

const owner = (site: Site) =>
  site.sqlite.run(`insert into app_config (key, value, updated_at) values ('admin_email', 'owner@example.com', 1)`)

describe("what the owner is told", () => {
  test("the week's numbers count sign-ups, paid orders and revenue", async () => {
    const site = await testSite(settings)
    const order = await customerWithOrder(site)
    await transfer(site, { id: 1, transferType: "in", transferAmount: order.amountVnd, content: order.memo })
    const numbers = await weeklyNumbers(createDatabase(site.env.DB))
    expect(numbers).toMatchObject({ signups: 1, orders: 1, buyers: 1, revenueVnd: 299_000, ordersToReview: 0 })
    expect(weeklyReportText(numbers)).toContain("doanh thu 299.000 đ")
  })

  test("the report goes out on Monday only, and only when an address is set", async () => {
    const site = await testSite(settings)
    const db = createDatabase(site.env.DB)
    expect(await sendWeeklyReport(site.env, db, MONDAY)).toBe(false)
    owner(site)
    expect(await sendWeeklyReport(site.env, db, TUESDAY)).toBe(false)
    expect(await sendWeeklyReport(site.env, db, MONDAY)).toBe(true)
    expect(site.outbox.at(-1)).toMatchObject({ to: "owner@example.com" })
    expect(site.outbox.at(-1)?.subject).toContain("Báo cáo tuần")
  })

  test("a transfer short of its order, and one that matches no order, each send a note", async () => {
    const site = await testSite(settings)
    owner(site)
    const order = await customerWithOrder(site)
    await transfer(site, { id: 1, transferType: "in", transferAmount: 1000, content: order.memo })
    expect(site.outbox.at(-1)).toMatchObject({ to: "owner@example.com" })
    expect(site.outbox.at(-1)?.subject).toContain("thiếu tiền")
    await transfer(site, { id: 2, transferType: "in", transferAmount: 5000, content: "cam on shop" })
    expect(site.outbox.at(-1)?.subject).toContain("không khớp đơn")
    expect((await weeklyNumbers(createDatabase(site.env.DB))).ordersToReview).toBe(1)
  })

  test("money going out is not counted as a transfer that matched no order", async () => {
    const site = await testSite(settings)
    await transfer(site, { id: 5, transferType: "out", transferAmount: 9000, content: "rut tien" })
    await transfer(site, { id: 6, transferType: "in", transferAmount: 5000, content: "cam on shop" })
    expect(await weeklyNumbers(createDatabase(site.env.DB))).toMatchObject({
      unmatchedTransfers: 1,
      unmatchedVnd: 5000,
    })
  })

  test("without an address nothing is sent and the webhook answers as before", async () => {
    const site = await testSite(settings)
    const before = site.outbox.length
    const res = await transfer(site, { id: 2, transferType: "in", transferAmount: 5000, content: "cam on shop" })
    expect(await res.json()).toMatchObject({ ignored: "no matching order" })
    expect(site.outbox.length).toBe(before)
  })
})
