import { and, eq, gte, sql } from "drizzle-orm"
import { ApiError, type User } from "../app"
import type { Database } from "../db/client"
import { chat_usage, plans, subscriptions } from "../db/schema"

const DAY_MS = 24 * 60 * 60 * 1000

// Calendar day in Asia/Ho_Chi_Minh (UTC+7, no DST) so daily limits reset at local midnight.
export function vietnamDay(now = Date.now()) {
  return new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function nextVietnamMidnight(now = Date.now()) {
  const shifted = now + 7 * 60 * 60 * 1000
  return Math.floor(shifted / DAY_MS) * DAY_MS + DAY_MS - 7 * 60 * 60 * 1000
}

export async function loadPlan(db: Database, user: User) {
  const effectiveTier = user.tier !== "free" && user.tier_until && user.tier_until < Date.now() ? "free" : user.tier
  const plan = await db.select().from(plans).where(eq(plans.id, effectiveTier)).get()
  if (!plan) throw new ApiError(500, "PLAN_MISSING", "Thiếu cấu hình gói")
  return plan
}

export type Plan = Awaited<ReturnType<typeof loadPlan>>

export async function assertChatQuota(db: Database, user: User, plan: Plan) {
  if (plan.chat_daily_messages !== null) {
    const row = await db
      .select({ messages: chat_usage.messages })
      .from(chat_usage)
      .where(and(eq(chat_usage.user_id, user.id), eq(chat_usage.day, vietnamDay())))
      .get()
    if ((row?.messages ?? 0) >= plan.chat_daily_messages) {
      throw new ApiError(429, "CHAT_QUOTA_DAILY", "Bạn đã hết lượt chat hôm nay", {
        resetAt: nextVietnamMidnight(),
        limit: plan.chat_daily_messages,
      })
    }
    return
  }
  const sub = await db
    .select({ period_start: subscriptions.period_start, period_end: subscriptions.period_end })
    .from(subscriptions)
    .where(and(eq(subscriptions.user_id, user.id), eq(subscriptions.status, "active")))
    .get()
  const periodStart = sub?.period_start ?? Date.now() - 30 * DAY_MS
  const totals = await db
    .select({
      messages: sql<number>`coalesce(sum(${chat_usage.messages}), 0)`,
      tokens: sql<number>`coalesce(sum(${chat_usage.input_tokens} + ${chat_usage.output_tokens}), 0)`,
    })
    .from(chat_usage)
    .where(and(eq(chat_usage.user_id, user.id), gte(chat_usage.day, vietnamDay(periodStart))))
    .get()
  const resetAt = sub?.period_end ?? nextVietnamMidnight()
  if (plan.chat_monthly_messages !== null && (totals?.messages ?? 0) >= plan.chat_monthly_messages) {
    throw new ApiError(429, "CHAT_QUOTA_MONTHLY", "Bạn đã hết lượt chat trong chu kỳ này", {
      resetAt,
      limit: plan.chat_monthly_messages,
    })
  }
  if (plan.chat_monthly_tokens !== null && (totals?.tokens ?? 0) >= plan.chat_monthly_tokens) {
    throw new ApiError(429, "CHAT_QUOTA_TOKENS", "Bạn đang dùng ngữ cảnh rất lớn, hãy mở hội thoại mới", {
      resetAt,
      limit: plan.chat_monthly_tokens,
    })
  }
}

export async function recordChatUsage(
  db: Database,
  input: { userID: string; inputTokens: number; outputTokens: number; costUsd: number },
) {
  await db
    .insert(chat_usage)
    .values({
      user_id: input.userID,
      day: vietnamDay(),
      messages: 1,
      input_tokens: input.inputTokens,
      output_tokens: input.outputTokens,
      cost_usd: input.costUsd,
    })
    .onConflictDoUpdate({
      target: [chat_usage.user_id, chat_usage.day],
      set: {
        messages: sql`${chat_usage.messages} + 1`,
        input_tokens: sql`${chat_usage.input_tokens} + ${input.inputTokens}`,
        output_tokens: sql`${chat_usage.output_tokens} + ${input.outputTokens}`,
        cost_usd: sql`${chat_usage.cost_usd} + ${input.costUsd}`,
      },
    })
}

export async function todayUsage(db: Database, userID: string) {
  const row = await db
    .select({ messages: chat_usage.messages })
    .from(chat_usage)
    .where(and(eq(chat_usage.user_id, userID), eq(chat_usage.day, vietnamDay())))
    .get()
  return row?.messages ?? 0
}
