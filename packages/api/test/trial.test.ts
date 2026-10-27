import { describe, expect, test } from "bun:test"
import { balance } from "../src/credits/ledger"
import { grantTrial, trialCredits } from "../src/credits/trial"
import { app_config } from "../src/db/schema"
import { imageAccess } from "../src/routes/images"
import { testDatabase } from "./db"

describe("trial credits", () => {
  test("seeded config grants 10 credits once and can be turned off", async () => {
    const db = await testDatabase()
    expect(await trialCredits(db)).toBe(10)
    expect(await grantTrial(db, "u1")).toBe(10)
    expect(await balance(db, "u1")).toBe(10)
    await db.update(app_config).set({ value: "0" })
    expect(await grantTrial(db, "u2")).toBe(0)
    expect(await balance(db, "u2")).toBe(0)
  })

  test("imageAccess: paid keeps plan limit, free with credits gets FLUX only, free without nothing", () => {
    expect(imageAccess(4, 0)).toEqual({ parallelLimit: 4, models: null, trial: false })
    expect(imageAccess(0, 10)).toEqual({ parallelLimit: 1, models: ["flux-3-klein"], trial: true })
    expect(imageAccess(0, 0)).toMatchObject({ parallelLimit: 0, trial: false })
  })
})
