import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { activateOrder, expireSubscriptions } from "../src/billing/activate"
import { PERIOD_MS } from "../src/billing/plans"
import { balance } from "../src/credits/ledger"
import { plan_orders, subscriptions, users } from "../src/db/schema"
import { testDatabase } from "./db"

async function seedUser(db: Awaited<ReturnType<typeof testDatabase>>, id: string) {
  await db
    .insert(users)
    .values({ id, email: `${id}@x`, password_hash: "h", password_salt: "s", password_iterations: 1 })
}

async function order(
  db: Awaited<ReturnType<typeof testDatabase>>,
  id: string,
  userID: string,
  kind: "plan" | "topup",
  item: string,
) {
  const row = {
    id,
    user_id: userID,
    kind,
    item_id: item,
    amount_vnd: 1,
    memo: `KW${id}`,
    status: "pending" as const,
    expires_at: 0,
  }
  await db.insert(plan_orders).values(row)
  return (await db.select().from(plan_orders).where(eq(plan_orders.id, id)).get())!
}

describe("activateOrder", () => {
  test("activates a plan, renews it, and refuses a second activation of the same order", async () => {
    const db = await testDatabase()
    await seedUser(db, "u1")
    const now = Date.UTC(2026, 0, 1)
    const first = await order(db, "o1", "u1", "plan", "starter")
    expect(await activateOrder(db, first, { bankEventID: "b1", now })).toBe(true)
    expect(await activateOrder(db, first, { bankEventID: "b1", now })).toBe(false)
    expect(await balance(db, "u1", now)).toBe(180)
    expect(await db.select().from(users).where(eq(users.id, "u1")).get()).toMatchObject({
      tier: "starter",
      tier_until: now + PERIOD_MS,
    })

    const second = await order(db, "o2", "u1", "plan", "starter")
    expect(await activateOrder(db, second, { bankEventID: "b2", now: now + 10 })).toBe(true)
    const subs = await db.select().from(subscriptions).where(eq(subscriptions.user_id, "u1"))
    expect(subs).toHaveLength(1)
    expect(subs[0]?.period_end).toBe(now + 2 * PERIOD_MS)
    expect(await balance(db, "u1", now)).toBe(360)
  })

  test("upgrading starts a new period and keeps old credits; top-up needs nothing special", async () => {
    const db = await testDatabase()
    await seedUser(db, "u2")
    const now = Date.UTC(2026, 0, 1)
    await activateOrder(db, await order(db, "o1", "u2", "plan", "starter"), { bankEventID: "b1", now })
    await activateOrder(db, await order(db, "o2", "u2", "plan", "plus"), { bankEventID: "b2", now: now + 5 * 86400000 })
    const subs = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.user_id, "u2"))
      .orderBy(subscriptions.period_start)
    expect(subs.map((s) => [s.plan_id, s.status])).toEqual([
      ["starter", "expired"],
      ["plus", "active"],
    ])
    expect(await balance(db, "u2", now + 6 * 86400000)).toBe(180 + 750)
    await activateOrder(db, await order(db, "o3", "u2", "topup", "topup-200"), {
      bankEventID: "b3",
      now: now + 6 * 86400000,
    })
    expect(await balance(db, "u2", now + 6 * 86400000)).toBe(180 + 750 + 200)
  })

  test("expireSubscriptions downgrades once the period ends", async () => {
    const db = await testDatabase()
    await seedUser(db, "u3")
    const now = Date.UTC(2026, 0, 1)
    await activateOrder(db, await order(db, "o1", "u3", "plan", "ultra"), { bankEventID: "b1", now })
    expect(await expireSubscriptions(db, now + PERIOD_MS - 1)).toBe(0)
    expect(await expireSubscriptions(db, now + PERIOD_MS + 1)).toBe(1)
    expect(await db.select().from(users).where(eq(users.id, "u3")).get()).toMatchObject({
      tier: "free",
      tier_until: null,
    })
  })
})
