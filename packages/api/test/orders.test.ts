import { describe, expect, test } from "bun:test"
import { openOrder } from "../src/billing/orders"
import { plan_orders, users } from "../src/db/schema"
import { testDatabase } from "./db"

describe("openOrder", () => {
  test("reuses a payable order and skips one past its deadline that is still marked pending", async () => {
    const db = await testDatabase()
    await db
      .insert(users)
      .values({ id: "u1", email: "u1@x", password_hash: "h", password_salt: "s", password_iterations: 1 })
    const now = Date.UTC(2026, 0, 1)
    const base = { user_id: "u1", kind: "plan" as const, item_id: "starter", amount_vnd: 1, status: "pending" as const }
    await db.insert(plan_orders).values({ ...base, id: "old", memo: "KWOLD", expires_at: now - 1 })
    expect(await openOrder(db, "u1", "starter", now)).toBeUndefined()

    await db.insert(plan_orders).values({ ...base, id: "live", memo: "KWLIVE", expires_at: now + 1000 })
    expect((await openOrder(db, "u1", "starter", now))?.id).toBe("live")
    expect(await openOrder(db, "u1", "plus", now)).toBeUndefined()
    expect(await openOrder(db, "u2", "starter", now)).toBeUndefined()
  })
})
