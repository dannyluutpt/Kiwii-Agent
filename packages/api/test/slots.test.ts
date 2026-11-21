import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { ApiError } from "../src/app"
import { balance, grant, reserve } from "../src/credits/ledger"
import { generations } from "../src/db/schema"
import { holdSlot } from "../src/images/prepare"
import { testDatabase } from "./db"

const DAY = 24 * 60 * 60 * 1000

// Two requests sent together: both passed the count taken before either had a row.
async function twoRuns() {
  const db = await testDatabase()
  await grant(db, { userID: "u1", source: "plan", amount: 100, expiresAt: Date.now() + DAY, reason: "p" })
  for (const id of ["run-a", "run-b"]) {
    await reserve(db, { userID: "u1", amount: 10, generationID: id, reason: "t" })
    await db.insert(generations).values({
      id,
      user_id: "u1",
      status: "running",
      model: "flux-3-klein",
      option: "1K",
      aspect_ratio: "1:1",
      n: 1,
      prompt_raw: "a cat",
      credits_reserved: 10,
    })
  }
  return db
}

describe("holdSlot", () => {
  test("on a plan that runs one at a time, the later of two runs is refused, removed and refunded", async () => {
    const db = await twoRuns()
    await holdSlot(db, { id: "run-a", user_id: "u1" }, 1, "over")
    const refused = await holdSlot(db, { id: "run-b", user_id: "u1" }, 1, "over").catch((error: unknown) => error)
    expect(refused).toBeInstanceOf(ApiError)
    expect(refused).toMatchObject({ status: 429, code: "PARALLEL_LIMIT", extra: { limit: 1 } })
    expect(await db.select().from(generations).where(eq(generations.id, "run-b")).get()).toBeUndefined()
    expect(await balance(db, "u1")).toBe(90)
  })

  test("both keep their place on a plan that runs two", async () => {
    const db = await twoRuns()
    await holdSlot(db, { id: "run-a", user_id: "u1" }, 2, "over")
    await holdSlot(db, { id: "run-b", user_id: "u1" }, 2, "over")
    expect(await balance(db, "u1")).toBe(80)
  })
})
