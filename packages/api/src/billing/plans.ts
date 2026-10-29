import type { Tier } from "../db/schema"

export const PERIOD_MS = 30 * 24 * 60 * 60 * 1000
export const TOPUP_TTL_MS = 90 * 24 * 60 * 60 * 1000
export const ORDER_TTL_MS = 24 * 60 * 60 * 1000

// Credit packs sold on top of an active paid plan. A credit here costs more than in any plan
// (Starter's is 1,661 đ), so upgrading always beats topping up: 1,895 đ and 1,790 đ a credit.
export const TOPUP_PACKS = [
  { id: "topup-200", credits: 200, price_vnd: 379_000 },
  { id: "topup-1000", credits: 1000, price_vnd: 1_790_000 },
] as const

export type TopupPackID = (typeof TOPUP_PACKS)[number]["id"]

export const PAID_TIERS: readonly Tier[] = ["starter", "plus", "ultra"]

export function isPaidTier(tier: string): tier is Exclude<Tier, "free"> {
  return PAID_TIERS.includes(tier as Tier)
}

// Bank memos get upper-cased, trimmed and stripped of punctuation by some banks, so the code is
// short, unambiguous (no O/0, I/1) and matched case-insensitively.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export function generateMemo() {
  const bytes = crypto.getRandomValues(new Uint8Array(8))
  return `KW${Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("")}`
}

export function findMemo(text: string) {
  return text.toUpperCase().match(/KW[A-Z2-9]{8}/)?.[0]
}

export function vietQRUrl(input: { bank: string; account: string; amount: number; memo: string; name?: string }) {
  const url = new URL(`https://img.vietqr.io/image/${input.bank}-${input.account}-compact2.png`)
  url.searchParams.set("amount", String(input.amount))
  url.searchParams.set("addInfo", input.memo)
  if (input.name) url.searchParams.set("accountName", input.name)
  return url.toString()
}
