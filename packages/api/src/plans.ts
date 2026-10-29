import { eq } from "drizzle-orm"
import { ApiError, type User } from "./app"
import type { Database } from "./db/client"
import { plans, type Tier } from "./db/schema"

// Source of truth for the seed migration and for tests. Runtime reads the `plans` table so
// prices can change without a deploy; keep this in sync when editing the seed. The table still has
// the chat_* columns of the retired chat (chat_context_tokens is NOT NULL); nothing reads them.
export const PLAN_SEED = [
  {
    id: "free",
    name_vi: "Miễn phí",
    name_en: "Free",
    price_vnd: 0,
    price_usd: 0,
    credits: 0,
    parallel_limit: 0,
  },
  {
    id: "starter",
    name_vi: "Starter",
    name_en: "Starter",
    price_vnd: 299_000,
    price_usd: 11.7,
    credits: 180,
    parallel_limit: 2,
  },
  {
    id: "plus",
    name_vi: "Plus",
    name_en: "Plus",
    price_vnd: 949_000,
    price_usd: 37.2,
    credits: 750,
    parallel_limit: 4,
  },
  {
    id: "ultra",
    name_vi: "Ultra",
    name_en: "Ultra",
    price_vnd: 2_490_000,
    price_usd: 97.7,
    credits: 2_300,
    parallel_limit: 8,
  },
] as const satisfies ReadonlyArray<{ id: Tier } & Record<string, unknown>>

// The plan a user is on now: a paid tier past its end date counts as free.
export async function loadPlan(db: Database, user: User) {
  const effectiveTier = user.tier !== "free" && user.tier_until && user.tier_until < Date.now() ? "free" : user.tier
  const plan = await db.select().from(plans).where(eq(plans.id, effectiveTier)).get()
  if (!plan) throw new ApiError(500, "PLAN_MISSING", "Thiếu cấu hình gói")
  return plan
}

export type Plan = Awaited<ReturnType<typeof loadPlan>>
