import { describe, expect, test } from "bun:test"
import { balance } from "../src/credits/ledger"
import { grantTrial, trialCredits } from "../src/credits/trial"
import { app_config } from "../src/db/schema"
import { accessAllows, imageAccess } from "../src/images/prepare"
import { testDatabase } from "./db"

describe("trial credits", () => {
  test("seeded config grants 3 credits once and can be turned off", async () => {
    const db = await testDatabase()
    expect(await trialCredits(db)).toBe(3)
    expect(await grantTrial(db, "u1")).toBe(3)
    expect(await balance(db, "u1")).toBe(3)
    await db.update(app_config).set({ value: "0" })
    expect(await grantTrial(db, "u2")).toBe(0)
    expect(await balance(db, "u2")).toBe(0)
  })

  test("imageAccess: paid keeps plan limit, free with credits gets FLUX 1K only, free without nothing", () => {
    expect(imageAccess(4, 0)).toEqual({ parallelLimit: 4, models: null, options: null, trial: false })
    expect(imageAccess(0, 3)).toEqual({ parallelLimit: 1, models: ["flux-3-klein"], options: ["1K"], trial: true })
    expect(imageAccess(0, 0)).toMatchObject({ parallelLimit: 0, trial: false })
  })

  test("a trial runs FLUX at its lowest setting only; a paid plan runs anything", () => {
    const trial = imageAccess(0, 3)
    expect(accessAllows(trial, "flux-3-klein", "1K")).toBe(true)
    expect(accessAllows(trial, "flux-3-klein", "2K")).toBe(false)
    expect(accessAllows(trial, "gpt-image-2.5", "low")).toBe(false)
    expect(accessAllows(imageAccess(4, 0), "gpt-image-2.5", "max")).toBe(true)
  })
})
