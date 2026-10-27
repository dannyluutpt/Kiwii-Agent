import { and, asc, eq, gt, lte, sql } from "drizzle-orm"
import { ulid } from "ulid"
import { ApiError } from "../app"
import type { Database } from "../db/client"
import { credit_grants, credit_ledger, type GrantSource } from "../db/schema"

// D1 has no interactive transactions, so every step is a single statement that is safe to
// re-run: conditional UPDATEs guard balances and the ledger records exactly what moved.

export async function balance(db: Database, userID: string, now = Date.now()) {
  const row = await db
    .select({ total: sql<number>`coalesce(sum(${credit_grants.remaining}), 0)` })
    .from(credit_grants)
    .where(and(eq(credit_grants.user_id, userID), gt(credit_grants.expires_at, now)))
    .get()
  return row?.total ?? 0
}

export async function grant(
  db: Database,
  input: { userID: string; source: (typeof GrantSource)[number]; amount: number; expiresAt: number; reason: string },
) {
  const id = ulid()
  await db.insert(credit_grants).values({
    id,
    user_id: input.userID,
    source: input.source,
    amount: input.amount,
    remaining: input.amount,
    expires_at: input.expiresAt,
  })
  await db.insert(credit_ledger).values({
    id: ulid(),
    user_id: input.userID,
    grant_id: id,
    type: "grant",
    delta: input.amount,
    balance_after: await balance(db, input.userID),
    reason: input.reason,
  })
  return id
}

// Drains grants that expire soonest first and records one ledger row per grant touched, so a
// refund can put the credits back where they came from.
export async function reserve(
  db: Database,
  input: { userID: string; amount: number; generationID: string; reason: string },
) {
  const now = Date.now()
  if ((await balance(db, input.userID, now)) < input.amount) {
    throw new ApiError(402, "INSUFFICIENT_CREDITS", "Không đủ credit, hãy nâng gói hoặc mua thêm")
  }
  const grants = await db
    .select({ id: credit_grants.id, remaining: credit_grants.remaining })
    .from(credit_grants)
    .where(
      and(eq(credit_grants.user_id, input.userID), gt(credit_grants.expires_at, now), gt(credit_grants.remaining, 0)),
    )
    .orderBy(asc(credit_grants.expires_at))
  let left = input.amount
  for (const row of grants) {
    if (left === 0) break
    const take = Math.min(left, row.remaining)
    const result = await db
      .update(credit_grants)
      .set({ remaining: sql`${credit_grants.remaining} - ${take}` })
      .where(and(eq(credit_grants.id, row.id), sql`${credit_grants.remaining} >= ${take}`))
      .returning({ id: credit_grants.id })
    // Another request drained this grant between the select and the update; move on.
    if (result.length === 0) continue
    left -= take
    await db.insert(credit_ledger).values({
      id: ulid(),
      user_id: input.userID,
      grant_id: row.id,
      generation_id: input.generationID,
      type: "reserve",
      delta: -take,
      balance_after: await balance(db, input.userID, now),
      reason: input.reason,
    })
  }
  if (left > 0) {
    await refund(db, { userID: input.userID, generationID: input.generationID, reason: "reserve lost a race" })
    throw new ApiError(402, "INSUFFICIENT_CREDITS", "Không đủ credit, hãy nâng gói hoặc mua thêm")
  }
}

// Returns every credit reserved for a generation (optionally only `amount` of them) to the
// grants they were taken from; already-refunded rows are skipped so retries stay idempotent.
export async function refund(
  db: Database,
  input: { userID: string; generationID: string; reason: string; amount?: number },
) {
  const rows = await db
    .select({ grant_id: credit_ledger.grant_id, delta: credit_ledger.delta, type: credit_ledger.type })
    .from(credit_ledger)
    .where(and(eq(credit_ledger.generation_id, input.generationID), eq(credit_ledger.user_id, input.userID)))
  const perGrant = new Map<string, number>()
  for (const row of rows) {
    if (!row.grant_id) continue
    const current = perGrant.get(row.grant_id) ?? 0
    if (row.type === "reserve") perGrant.set(row.grant_id, current - row.delta)
    if (row.type === "refund") perGrant.set(row.grant_id, current - row.delta)
  }
  let left = input.amount ?? Infinity
  let refunded = 0
  for (const [grantID, owed] of perGrant) {
    const give = Math.min(owed, left)
    if (give <= 0) continue
    await db
      .update(credit_grants)
      .set({ remaining: sql`${credit_grants.remaining} + ${give}` })
      .where(eq(credit_grants.id, grantID))
    await db.insert(credit_ledger).values({
      id: ulid(),
      user_id: input.userID,
      grant_id: grantID,
      generation_id: input.generationID,
      type: "refund",
      delta: give,
      balance_after: await balance(db, input.userID),
      reason: input.reason,
    })
    left -= give
    refunded += give
  }
  return refunded
}

export async function settle(db: Database, input: { userID: string; generationID: string; costUsd: number }) {
  await db.insert(credit_ledger).values({
    id: ulid(),
    user_id: input.userID,
    generation_id: input.generationID,
    type: "settle",
    delta: 0,
    balance_after: await balance(db, input.userID),
    reason: `cost_usd=${input.costUsd.toFixed(4)}`,
  })
}

// Zeroes grants past their expiry and writes one ledger row each. Safe to run daily.
export async function expireGrants(db: Database, now = Date.now()) {
  const rows = await db
    .select({ id: credit_grants.id, user_id: credit_grants.user_id, remaining: credit_grants.remaining })
    .from(credit_grants)
    .where(and(lte(credit_grants.expires_at, now), gt(credit_grants.remaining, 0)))
  for (const row of rows) {
    await db.update(credit_grants).set({ remaining: 0 }).where(eq(credit_grants.id, row.id))
    await db.insert(credit_ledger).values({
      id: ulid(),
      user_id: row.user_id,
      grant_id: row.id,
      type: "expire",
      delta: -row.remaining,
      balance_after: await balance(db, row.user_id, now),
      reason: "grant expired",
    })
  }
  return rows.length
}
