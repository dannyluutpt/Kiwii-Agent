import { and, desc, eq } from "drizzle-orm"
import { ulid } from "ulid"
import { z } from "zod"
import { ApiError, createApp } from "../app"
import { activateOrder } from "../billing/activate"
import { findMemo, generateMemo, isPaidTier, ORDER_TTL_MS, TOPUP_PACKS, vietQRUrl } from "../billing/plans"
import { balance } from "../credits/ledger"
import { bank_events, credit_ledger, plan_orders, plans, subscriptions, users } from "../db/schema"
import { requireAuth } from "../middleware/auth"
import { timingSafeEqual } from "../util/crypto"

const CreateOrder = z.union([
  z.object({ kind: z.literal("plan"), id: z.enum(["starter", "plus", "ultra"]) }),
  z.object({ kind: z.literal("topup"), id: z.enum(["topup-200", "topup-1000"]) }),
])

// Shape documented at developer.sepay.vn; anything else is ignored rather than rejected so a
// field they add later cannot break activation.
const SepayWebhook = z.object({
  id: z.coerce.number(),
  transferType: z.string(),
  transferAmount: z.coerce.number(),
  content: z.string().default(""),
  code: z.string().nullish(),
  description: z.string().nullish(),
})

export const billing = createApp()

billing.get("/plans", async (c) => {
  const rows = await c.get("db").select().from(plans).where(eq(plans.active, 1))
  return c.json({
    plans: rows.map((p) => ({
      id: p.id,
      name: p.name_vi,
      priceVnd: p.price_vnd,
      credits: p.credits,
      chatDailyMessages: p.chat_daily_messages,
      chatMonthlyMessages: p.chat_monthly_messages,
      chatContextTokens: p.chat_context_tokens,
      parallelLimit: p.parallel_limit,
    })),
    topups: TOPUP_PACKS.map((t) => ({ id: t.id, credits: t.credits, priceVnd: t.price_vnd })),
  })
})

// The webhook is called by SePay, not the browser, so it sits above the auth guard.
billing.post("/webhook/sepay", async (c) => {
  const expected = c.env.SEPAY_API_KEY
  if (!expected) throw new ApiError(500, "SEPAY_NOT_CONFIGURED", "Thiếu SEPAY_API_KEY")
  const header = c.req.header("authorization") ?? ""
  if (!timingSafeEqual(header, `Apikey ${expected}`)) throw new ApiError(401, "BAD_WEBHOOK_KEY", "Sai khoá webhook")
  const raw = await c.req.text()
  const parsed = SepayWebhook.safeParse(JSON.parse(raw))
  if (!parsed.success) throw new ApiError(400, "BAD_WEBHOOK_BODY", "Payload không hợp lệ")
  const event = parsed.data
  const db = c.get("db")
  // A retried delivery hits the primary key and stops here; the first delivery already acted.
  const inserted = await db
    .insert(bank_events)
    .values({
      sepay_id: String(event.id),
      amount: event.transferAmount,
      content: event.content,
      raw,
      received_at: Date.now(),
    })
    .onConflictDoNothing()
    .returning({ id: bank_events.sepay_id })
  if (inserted.length === 0) return c.json({ ok: true, duplicate: true })
  if (event.transferType !== "in") return c.json({ ok: true, ignored: "outgoing" })

  const memo = findMemo(`${event.code ?? ""} ${event.content} ${event.description ?? ""}`)
  const order = memo ? await db.select().from(plan_orders).where(eq(plan_orders.memo, memo)).get() : undefined
  if (!order) return c.json({ ok: true, ignored: "no matching order" })
  await db
    .update(bank_events)
    .set({ order_id: order.id })
    .where(eq(bank_events.sepay_id, String(event.id)))
  if (order.status !== "pending") return c.json({ ok: true, ignored: `order ${order.status}` })
  if (event.transferAmount < order.amount_vnd) {
    await db.update(plan_orders).set({ status: "pending_review" }).where(eq(plan_orders.id, order.id))
    return c.json({ ok: true, review: "amount below order" })
  }
  const activated = await activateOrder(db, order, { bankEventID: String(event.id) })
  return c.json({ ok: true, activated })
})

billing.use("*", requireAuth)

billing.post("/orders", async (c) => {
  const body = CreateOrder.parse(await c.req.json())
  const db = c.get("db")
  const user = c.get("user")
  if (!c.env.SEPAY_BANK_ACCOUNT) throw new ApiError(500, "SEPAY_NOT_CONFIGURED", "Chưa cấu hình tài khoản nhận tiền")
  const amount = await (async () => {
    if (body.kind === "topup") {
      if (!isPaidTier(user.tier) || !user.tier_until || user.tier_until < Date.now()) {
        throw new ApiError(403, "TOPUP_NEEDS_PLAN", "Mua thêm credit cần có gói trả phí đang hoạt động")
      }
      return TOPUP_PACKS.find((t) => t.id === body.id)!.price_vnd
    }
    const plan = await db.select({ price: plans.price_vnd }).from(plans).where(eq(plans.id, body.id)).get()
    if (!plan) throw new ApiError(404, "PLAN_NOT_FOUND", "Không tìm thấy gói")
    return plan.price
  })()
  // Reuse a still-pending order for the same item so a refresh does not mint a new memo.
  const existing = await db
    .select()
    .from(plan_orders)
    .where(and(eq(plan_orders.user_id, user.id), eq(plan_orders.status, "pending"), eq(plan_orders.item_id, body.id)))
    .get()
  const order =
    existing && existing.expires_at > Date.now()
      ? existing
      : await db
          .insert(plan_orders)
          .values({
            id: ulid(),
            user_id: user.id,
            kind: body.kind,
            item_id: body.id,
            amount_vnd: amount,
            memo: generateMemo(),
            expires_at: Date.now() + ORDER_TTL_MS,
          })
          .returning()
          .then((rows) => rows[0]!)
  return c.json(presentOrder(order, c.env))
})

billing.get("/orders/:id", async (c) => {
  const order = await c
    .get("db")
    .select()
    .from(plan_orders)
    .where(and(eq(plan_orders.id, c.req.param("id")), eq(plan_orders.user_id, c.get("user").id)))
    .get()
  if (!order) throw new ApiError(404, "ORDER_NOT_FOUND", "Không tìm thấy đơn")
  return c.json(presentOrder(order, c.env))
})

billing.get("/subscription", async (c) => {
  const db = c.get("db")
  const user = c.get("user")
  const sub = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.user_id, user.id), eq(subscriptions.status, "active")))
    .get()
  const fresh = await db
    .select({ tier: users.tier, tier_until: users.tier_until })
    .from(users)
    .where(eq(users.id, user.id))
    .get()
  return c.json({
    tier: fresh?.tier ?? "free",
    tierUntil: fresh?.tier_until ?? null,
    periodStart: sub?.period_start ?? null,
    periodEnd: sub?.period_end ?? null,
    credits: await balance(db, user.id),
  })
})

billing.get("/ledger", async (c) => {
  const rows = await c
    .get("db")
    .select({
      id: credit_ledger.id,
      type: credit_ledger.type,
      delta: credit_ledger.delta,
      balanceAfter: credit_ledger.balance_after,
      reason: credit_ledger.reason,
      createdAt: credit_ledger.created_at,
    })
    .from(credit_ledger)
    .where(eq(credit_ledger.user_id, c.get("user").id))
    .orderBy(desc(credit_ledger.created_at))
    .limit(100)
  return c.json({ entries: rows })
})

billing.get("/orders", async (c) => {
  const rows = await c
    .get("db")
    .select()
    .from(plan_orders)
    .where(eq(plan_orders.user_id, c.get("user").id))
    .orderBy(desc(plan_orders.created_at))
    .limit(20)
  return c.json({ orders: rows.map((o) => presentOrder(o, c.env)) })
})

function presentOrder(
  order: typeof plan_orders.$inferSelect,
  env: { SEPAY_BANK_CODE?: string; SEPAY_BANK_ACCOUNT?: string; SEPAY_ACCOUNT_NAME?: string },
) {
  return {
    id: order.id,
    kind: order.kind,
    itemID: order.item_id,
    amountVnd: order.amount_vnd,
    memo: order.memo,
    status: order.status,
    expiresAt: order.expires_at,
    paidAt: order.paid_at,
    createdAt: order.created_at,
    bank: {
      code: env.SEPAY_BANK_CODE ?? "MB",
      account: env.SEPAY_BANK_ACCOUNT ?? "",
      name: env.SEPAY_ACCOUNT_NAME ?? null,
    },
    qrUrl: vietQRUrl({
      bank: env.SEPAY_BANK_CODE ?? "MB",
      account: env.SEPAY_BANK_ACCOUNT ?? "",
      amount: order.amount_vnd,
      memo: order.memo,
      name: env.SEPAY_ACCOUNT_NAME,
    }),
  }
}
