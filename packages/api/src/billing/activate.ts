import { and, eq, inArray, lte } from "drizzle-orm"
import { ulid } from "ulid"
import { balance, grantWrites } from "../credits/ledger"
import type { Database } from "../db/client"
import { plan_events, plan_orders, plans, subscriptions, users, type Tier } from "../db/schema"
import { isPaidTier, PERIOD_MS, TOPUP_PACKS, TOPUP_TTL_MS } from "./plans"

type Order = typeof plan_orders.$inferSelect

// An order the money can still be put towards: one waiting, or one whose day ran out before the
// transfer landed. The customer paid either way.
export const PAYABLE = ["pending", "expired"] as const

// Marks the order paid and applies it. The claim lets one payment through; everything it buys is
// then written in one batch, so the plan, the credits and their records land together. If that
// batch fails the claim is given back and the error rethrown: the webhook answers 500 and SePay's
// retry finds the order payable again, instead of a paid order that granted nothing.
export async function activateOrder(db: Database, order: Order, input: { bankEventID: string; now?: number }) {
  const now = input.now ?? Date.now()
  const claimed = await db
    .update(plan_orders)
    .set({ status: "paid", paid_at: now, bank_event_id: input.bankEventID })
    .where(and(eq(plan_orders.id, order.id), inArray(plan_orders.status, PAYABLE)))
    .returning({ id: plan_orders.id })
  if (claimed.length === 0) return false
  const unclaim = (status: Order["status"]) =>
    db
      .update(plan_orders)
      .set({ status, paid_at: null, bank_event_id: null })
      .where(and(eq(plan_orders.id, order.id), eq(plan_orders.bank_event_id, input.bankEventID)))
  const applied = await apply(db, order, now).catch(async (error: unknown) => {
    await unclaim(order.status)
    throw error
  })
  // Money for something no longer sold (a pack or plan since removed): a person looks at it.
  if (!applied) await unclaim("pending_review")
  return applied
}

async function apply(db: Database, order: Order, now: number) {
  const balanceBefore = await balance(db, order.user_id, now)
  if (order.kind === "topup") {
    const pack = TOPUP_PACKS.find((p) => p.id === order.item_id)
    if (!pack) return false
    await db.batch([
      ...grantWrites(db, {
        userID: order.user_id,
        source: "topup",
        amount: pack.credits,
        expiresAt: now + TOPUP_TTL_MS,
        reason: `top-up ${pack.id} order ${order.id}`,
        balanceBefore,
      }),
      db.insert(plan_events).values({
        id: ulid(),
        user_id: order.user_id,
        type: "topup",
        order_id: order.id,
        payload: JSON.stringify({ pack: pack.id, credits: pack.credits }),
      }),
    ])
    return true
  }

  const tier = order.item_id as Tier
  if (!isPaidTier(tier)) return false
  const plan = await db.select().from(plans).where(eq(plans.id, tier)).get()
  if (!plan) return false
  const current = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.user_id, order.user_id), eq(subscriptions.status, "active")))
    .get()
  // Renewing the same plan stacks onto the current period; any other case starts a fresh one.
  const renewal = current !== undefined && current.plan_id === tier && current.period_end > now
  const periodStart = renewal ? current.period_end : now
  const periodEnd = periodStart + PERIOD_MS
  await db.batch([
    db.update(users).set({ tier, tier_until: periodEnd }).where(eq(users.id, order.user_id)),
    ...(current
      ? [
          db
            .update(subscriptions)
            .set({ status: renewal ? "active" : "expired", period_end: renewal ? periodEnd : now })
            .where(eq(subscriptions.id, current.id)),
        ]
      : []),
    ...(renewal
      ? []
      : [
          db.insert(subscriptions).values({
            id: ulid(),
            user_id: order.user_id,
            plan_id: tier,
            period_start: periodStart,
            period_end: periodEnd,
            status: "active",
            order_id: order.id,
          }),
        ]),
    ...grantWrites(db, {
      userID: order.user_id,
      source: "plan",
      amount: plan.credits,
      expiresAt: periodEnd,
      reason: `${renewal ? "renewal" : "activation"} ${tier} order ${order.id}`,
      balanceBefore,
    }),
    db.insert(plan_events).values({
      id: ulid(),
      user_id: order.user_id,
      type: renewal ? "renewed" : current ? "upgraded" : "activated",
      order_id: order.id,
      payload: JSON.stringify({ plan: tier, period_start: periodStart, period_end: periodEnd }),
    }),
  ])
  return true
}

// Daily: subscriptions past their period end drop the user back to free unless a renewal
// already pushed `tier_until` forward.
export async function expireSubscriptions(db: Database, now = Date.now()) {
  const rows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.status, "active"), lte(subscriptions.period_end, now)))
  let count = 0
  for (const sub of rows) {
    await db.update(subscriptions).set({ status: "expired" }).where(eq(subscriptions.id, sub.id))
    const user = await db.select({ tier_until: users.tier_until }).from(users).where(eq(users.id, sub.user_id)).get()
    if (user?.tier_until && user.tier_until > now) continue
    await db.update(users).set({ tier: "free", tier_until: null }).where(eq(users.id, sub.user_id))
    await db.insert(plan_events).values({
      id: ulid(),
      user_id: sub.user_id,
      type: "expired",
      order_id: sub.order_id,
      payload: JSON.stringify({ plan: sub.plan_id, period_end: sub.period_end }),
    })
    count++
  }
  return count
}
