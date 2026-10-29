import { eq } from "drizzle-orm"
import type { Database } from "../db/client"
import { app_config } from "../db/schema"
import { grant } from "./ledger"

export const TRIAL_TTL_MS = 14 * 24 * 60 * 60 * 1000
export const DEFAULT_TRIAL_CREDITS = 3
// The trial only unlocks the cheapest model at its lowest setting, so a free account costs a few cents.
export const TRIAL_MODELS = ["flux-3-klein"] as const
export const TRIAL_OPTIONS = ["1K"] as const

export async function trialCredits(db: Database) {
  const row = await db
    .select({ value: app_config.value })
    .from(app_config)
    .where(eq(app_config.key, "trial_credits"))
    .get()
  if (!row) return DEFAULT_TRIAL_CREDITS
  const parsed = Number(JSON.parse(row.value))
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : DEFAULT_TRIAL_CREDITS
}

// Called once per verified signup. Returns the amount granted (0 when the trial is off).
export async function grantTrial(db: Database, userID: string, now = Date.now()) {
  const amount = await trialCredits(db)
  if (amount === 0) return 0
  await grant(db, { userID, source: "bonus", amount, expiresAt: now + TRIAL_TTL_MS, reason: "trial credits at signup" })
  return amount
}
