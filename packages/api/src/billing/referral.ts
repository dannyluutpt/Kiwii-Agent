import { and, eq, sql } from "drizzle-orm"
import type { Database } from "../db/client"
import { app_config, credit_grants, plan_orders, users } from "../db/schema"
import { generateMemo } from "./plans"

// Credits given when an invited account pays for its first plan: to whoever invited it, and to the
// invited account on top of its plan. app_config.referral = {"referrer": 30, "friend": 20} changes
// either without a deploy; 0 turns that side off.
export const DEFAULT_REFERRAL = { referrer: 30, friend: 20 }
// How long the credits a referral gave may be used.
export const REFERRAL_TTL_MS = 60 * 24 * 60 * 60 * 1000

export async function referralRewards(db: Database) {
  const row = await db.select({ value: app_config.value }).from(app_config).where(eq(app_config.key, "referral")).get()
  if (!row) return DEFAULT_REFERRAL
  const parsed = parseRewards(row.value)
  const amount = (value: unknown, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback
  return {
    referrer: amount(parsed.referrer, DEFAULT_REFERRAL.referrer),
    friend: amount(parsed.friend, DEFAULT_REFERRAL.friend),
  }
}

function parseRewards(text: string): { referrer?: unknown; friend?: unknown } {
  try {
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

// The account's code to share, made the first time it is asked for. Same alphabet as a transfer
// memo, without its prefix: short, and no letters that read as digits.
export async function referralCode(db: Database, userID: string) {
  const existing = await db.select({ code: users.referral_code }).from(users).where(eq(users.id, userID)).get()
  if (existing?.code) return existing.code
  const code = generateMemo().slice(2)
  // Two tabs asking at once: the first write stays, and both read it back.
  await db
    .update(users)
    .set({ referral_code: code })
    .where(and(eq(users.id, userID), sql`${users.referral_code} is null`))
  const saved = await db.select({ code: users.referral_code }).from(users).where(eq(users.id, userID)).get()
  return saved?.code ?? code
}

// Whose code this is; nobody for a code that is not one.
export async function referrerOf(db: Database, code: string | undefined) {
  const cleaned = (code ?? "").trim().toUpperCase()
  if (!/^[A-Z2-9]{8}$/.test(cleaned)) return undefined
  const row = await db.select({ id: users.id }).from(users).where(eq(users.referral_code, cleaned)).get()
  return row?.id
}

// What the account's invitations have come to: how many signed up, how many went on to pay, and the
// credits that earned.
export async function referralStats(db: Database, userID: string) {
  const invited = await db
    .select({ count: sql<number>`count(*)` })
    .from(users)
    .where(eq(users.referred_by, userID))
    .get()
  const paid = await db
    .select({ count: sql<number>`count(distinct ${users.id})` })
    .from(users)
    .innerJoin(plan_orders, and(eq(plan_orders.user_id, users.id), eq(plan_orders.status, "paid")))
    .where(and(eq(users.referred_by, userID), eq(plan_orders.kind, "plan")))
    .get()
  const earned = await db
    .select({ total: sql<number>`coalesce(sum(${credit_grants.amount}), 0)` })
    .from(credit_grants)
    .where(and(eq(credit_grants.user_id, userID), eq(credit_grants.source, "referral")))
    .get()
  return { invited: invited?.count ?? 0, paid: paid?.count ?? 0, credits: earned?.total ?? 0 }
}
