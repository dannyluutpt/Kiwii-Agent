import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { balance, expireGrants, grant, refund, reserve, settle } from "../src/credits/ledger"
import { credit_grants, credit_ledger } from "../src/db/schema"
import { testDatabase } from "./db"

const DAY = 24 * 60 * 60 * 1000

describe("credit ledger", () => {
  test("grant, reserve from soonest-expiring grant first, refund puts it back", async () => {
    const db = await testDatabase()
    const now = Date.now()
    const topup = await grant(db, { userID: "u1", source: "topup", amount: 50, expiresAt: now + 90 * DAY, reason: "t" })
    const plan = await grant(db, { userID: "u1", source: "plan", amount: 100, expiresAt: now + 30 * DAY, reason: "p" })
    expect(await balance(db, "u1")).toBe(150)

    await reserve(db, { userID: "u1", amount: 120, generationID: "g1", reason: "gen" })
    expect(await balance(db, "u1")).toBe(30)
    const grants = Object.fromEntries(
      (await db.select().from(credit_grants).where(eq(credit_grants.user_id, "u1"))).map((g) => [g.id, g.remaining]),
    )
    expect(grants[plan]).toBe(0)
    expect(grants[topup]).toBe(30)

    expect(await refund(db, { userID: "u1", generationID: "g1", reason: "failed" })).toBe(120)
    expect(await balance(db, "u1")).toBe(150)
    expect(await refund(db, { userID: "u1", generationID: "g1", reason: "again" })).toBe(0)
    expect(await balance(db, "u1")).toBe(150)
  })

  test("partial refund and settle keep the ledger consistent", async () => {
    const db = await testDatabase()
    await grant(db, { userID: "u2", source: "plan", amount: 40, expiresAt: Date.now() + DAY, reason: "p" })
    await reserve(db, { userID: "u2", amount: 12, generationID: "g2", reason: "4 images" })
    expect(await refund(db, { userID: "u2", generationID: "g2", reason: "1 of 4 failed", amount: 3 })).toBe(3)
    await settle(db, { userID: "u2", generationID: "g2", costUsd: 0.1234 })
    expect(await balance(db, "u2")).toBe(31)
    const rows = await db.select().from(credit_ledger).where(eq(credit_ledger.user_id, "u2"))
    expect(rows.map((r) => r.type)).toEqual(["grant", "reserve", "refund", "settle"])
    expect(rows.at(-1)?.balance_after).toBe(31)
  })

  test("insufficient balance rejects without touching grants", async () => {
    const db = await testDatabase()
    await grant(db, { userID: "u3", source: "plan", amount: 5, expiresAt: Date.now() + DAY, reason: "p" })
    await expect(reserve(db, { userID: "u3", amount: 6, generationID: "g3", reason: "x" })).rejects.toMatchObject({
      code: "INSUFFICIENT_CREDITS",
    })
    expect(await balance(db, "u3")).toBe(5)
  })

  test("expired grants are ignored by balance and zeroed by expireGrants", async () => {
    const db = await testDatabase()
    const now = Date.now()
    await grant(db, { userID: "u4", source: "plan", amount: 20, expiresAt: now - 1, reason: "old" })
    await grant(db, { userID: "u4", source: "topup", amount: 7, expiresAt: now + DAY, reason: "new" })
    expect(await balance(db, "u4", now)).toBe(7)
    expect(await expireGrants(db, now)).toBe(1)
    const rows = await db.select().from(credit_ledger).where(eq(credit_ledger.user_id, "u4"))
    expect(rows.at(-1)).toMatchObject({ type: "expire", delta: -20, balance_after: 7 })
  })
})
