// Shared types and labels for pricing, checkout and the account's payment history.
import type { I18nKey } from "@/i18n/vi"

export type PlanInfo = {
  id: "free" | "starter" | "plus" | "ultra"
  name: string
  priceVnd: number
  credits: number
  parallelLimit: number
}
// The credits a new account gets to try the cheapest model, and for how long.
export type Trial = { credits: number; days: number }
export type Topup = { id: string; credits: number; priceVnd: number }

export type Order = {
  id: string
  kind: "plan" | "topup"
  itemID: string
  amountVnd: number
  memo: string
  status: "pending" | "paid" | "expired" | "pending_review"
  expiresAt: number
  paidAt: number | null
  createdAt: number
  bank: { code: string; account: string; name: string | null }
  qrUrl: string
}

type Translate = (key: I18nKey, params?: Record<string, string | number>) => string

export const vnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`

// "plus" → "Plus"; "topup-200" → 200.
export const planName = (id: string) => id.charAt(0).toUpperCase() + id.slice(1)
export const topupCredits = (id: string) => Number(id.replace(/\D/g, "")) || 0

// What an order buys, in one line: "Gói Plus · 30 ngày" or "200 credit · dùng trong 90 ngày".
export const orderItem = (order: Pick<Order, "kind" | "itemID">, t: Translate) =>
  order.kind === "plan"
    ? t("checkout.item.plan", { name: planName(order.itemID) })
    : t("checkout.item.topup", { n: topupCredits(order.itemID) })
