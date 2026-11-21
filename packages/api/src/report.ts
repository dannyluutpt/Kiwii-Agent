import { and, eq, gte, lt, sql } from "drizzle-orm"
import { sendEmail } from "./auth/email"
import { BRAND } from "./brand"
import type { Database } from "./db/client"
import { app_config, bank_events, generations, plan_orders, users } from "./db/schema"
import type { Env } from "./env"

const DAY = 24 * 60 * 60 * 1000

// Where the owner reads about the business: app_config.admin_email. Unset, nothing is sent.
export async function adminEmail(db: Database) {
  const row = await db
    .select({ value: app_config.value })
    .from(app_config)
    .where(eq(app_config.key, "admin_email"))
    .get()
  const email = row?.value.replaceAll('"', "").trim()
  return email && email.includes("@") ? email : undefined
}

// A note to the owner about something only a person can settle (money that matched no order, a
// transfer short of its order). A failure to send never fails what called it.
export async function notifyAdmin(env: Env, db: Database, subject: string, text: string) {
  const to = await adminEmail(db).catch(() => undefined)
  if (!to) return
  await sendEmail(env, { to, subject: `[${BRAND}] ${subject}`, text }).catch((error: unknown) =>
    console.error(`[admin] not sent: ${String(error)}`),
  )
}

// The week that ended at `now`, in numbers: who came, who paid, what ran and what it cost.
export async function weeklyNumbers(db: Database, now = Date.now()) {
  const since = now - 7 * DAY
  const count = sql<number>`count(*)`
  const signups = await db.select({ n: count }).from(users).where(gte(users.created_at, since)).get()
  const paid = await db
    .select({ n: count, revenue: sql<number>`coalesce(sum(${plan_orders.amount_vnd}), 0)` })
    .from(plan_orders)
    .where(and(eq(plan_orders.status, "paid"), gte(plan_orders.paid_at, since)))
    .get()
  const buyers = await db
    .select({ n: sql<number>`count(distinct ${plan_orders.user_id})` })
    .from(plan_orders)
    .where(and(eq(plan_orders.status, "paid"), gte(plan_orders.paid_at, since)))
    .get()
  const runs = await db
    .select({
      status: generations.status,
      kind: generations.kind,
      n: count,
      credits: sql<number>`coalesce(sum(${generations.credits_final}), 0)`,
      cost: sql<number>`coalesce(sum(${generations.cost_usd}), 0)`,
    })
    .from(generations)
    .where(and(gte(generations.created_at, since), lt(generations.created_at, now)))
    .groupBy(generations.status, generations.kind)
  const makers = await db
    .select({ n: sql<number>`count(distinct ${generations.user_id})` })
    .from(generations)
    .where(gte(generations.created_at, since))
    .get()
  const review = await db.select({ n: count }).from(plan_orders).where(eq(plan_orders.status, "pending_review")).get()
  const unmatched = await db
    .select({ n: count, amount: sql<number>`coalesce(sum(${bank_events.amount}), 0)` })
    .from(bank_events)
    .where(and(gte(bank_events.received_at, since), sql`${bank_events.order_id} is null`))
    .get()
  const sum = (pick: (row: (typeof runs)[number]) => number, where: (row: (typeof runs)[number]) => boolean) =>
    runs.filter(where).reduce((total, row) => total + pick(row), 0)
  return {
    signups: signups?.n ?? 0,
    orders: paid?.n ?? 0,
    buyers: buyers?.n ?? 0,
    revenueVnd: paid?.revenue ?? 0,
    makers: makers?.n ?? 0,
    images: sum(
      (row) => row.n,
      (row) => row.kind === "image" && row.status === "done",
    ),
    videos: sum(
      (row) => row.n,
      (row) => row.kind === "video" && row.status === "done",
    ),
    failed: sum(
      (row) => row.n,
      (row) => row.status === "failed",
    ),
    creditsUsed: sum(
      (row) => row.credits,
      (row) => row.status === "done",
    ),
    // What OpenRouter billed, failed runs' screening included.
    costUsd: sum(
      (row) => row.cost,
      () => true,
    ),
    ordersToReview: review?.n ?? 0,
    unmatchedTransfers: unmatched?.n ?? 0,
    unmatchedVnd: unmatched?.amount ?? 0,
  }
}

export function weeklyReportText(numbers: Awaited<ReturnType<typeof weeklyNumbers>>, now = Date.now()) {
  const vnd = (amount: number) => `${amount.toLocaleString("vi-VN")} đ`
  const day = (ms: number) => new Date(ms + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const total = numbers.images + numbers.videos + numbers.failed
  const lines = [
    `Báo cáo tuần ${BRAND}: ${day(now - 7 * DAY)} đến ${day(now)}`,
    "",
    `Đăng ký mới: ${numbers.signups}`,
    `Người có tạo ảnh hoặc video: ${numbers.makers}`,
    `Đơn đã thanh toán: ${numbers.orders} (${numbers.buyers} khách), doanh thu ${vnd(numbers.revenueVnd)}`,
    "",
    `Ảnh: ${numbers.images} lượt. Video: ${numbers.videos} lượt. Thất bại: ${numbers.failed}${total ? ` (${Math.round((numbers.failed / total) * 100)}%)` : ""}`,
    `Credit đã dùng: ${numbers.creditsUsed}`,
    `Chi phí OpenRouter: ${numbers.costUsd.toFixed(2)} USD`,
    "",
    numbers.ordersToReview
      ? `CẦN XỬ LÝ: ${numbers.ordersToReview} đơn chuyển thiếu tiền đang chờ bạn xem.`
      : "Không có đơn nào chờ xử lý.",
    numbers.unmatchedTransfers
      ? `CẦN XEM: ${numbers.unmatchedTransfers} khoản chuyển tới (${vnd(numbers.unmatchedVnd)}) không khớp đơn nào trong tuần.`
      : "Không có khoản chuyển nào không khớp đơn.",
  ]
  return lines.join("\n")
}

// Sent on Monday (Vietnam time) by the daily cron.
export async function sendWeeklyReport(env: Env, db: Database, now = Date.now()) {
  if (new Date(now + 7 * 60 * 60 * 1000).getUTCDay() !== 1) return false
  const to = await adminEmail(db)
  if (!to) return false
  const numbers = await weeklyNumbers(db, now)
  await sendEmail(env, {
    to,
    subject: `[${BRAND}] Báo cáo tuần: ${numbers.orders} đơn, ${numbers.revenueVnd.toLocaleString("vi-VN")} đ`,
    text: weeklyReportText(numbers, now),
  })
  return true
}
