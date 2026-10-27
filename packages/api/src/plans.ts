import type { Tier } from "./db/schema"

// Source of truth for the seed migration and for tests. Runtime reads the `plans` table so
// prices can change without a deploy; keep this in sync when editing the seed.
export const PLAN_SEED = [
  {
    id: "free",
    name_vi: "Miễn phí",
    name_en: "Free",
    price_vnd: 0,
    price_usd: 0,
    credits: 0,
    chat_daily_messages: 30,
    chat_monthly_messages: null,
    chat_monthly_tokens: null,
    chat_context_tokens: 32_000,
    parallel_limit: 0,
  },
  {
    id: "starter",
    name_vi: "Starter",
    name_en: "Starter",
    price_vnd: 299_000,
    price_usd: 11.7,
    credits: 180,
    chat_daily_messages: null,
    chat_monthly_messages: 3_500,
    chat_monthly_tokens: 25_000_000,
    chat_context_tokens: 64_000,
    parallel_limit: 2,
  },
  {
    id: "plus",
    name_vi: "Plus",
    name_en: "Plus",
    price_vnd: 949_000,
    price_usd: 37.2,
    credits: 750,
    chat_daily_messages: null,
    chat_monthly_messages: 11_000,
    chat_monthly_tokens: 80_000_000,
    chat_context_tokens: 128_000,
    parallel_limit: 4,
  },
  {
    id: "ultra",
    name_vi: "Ultra",
    name_en: "Ultra",
    price_vnd: 2_490_000,
    price_usd: 97.7,
    credits: 2_300,
    chat_daily_messages: null,
    chat_monthly_messages: 29_000,
    chat_monthly_tokens: 200_000_000,
    chat_context_tokens: 256_000,
    parallel_limit: 8,
  },
] as const satisfies ReadonlyArray<{ id: Tier } & Record<string, unknown>>

export const PAID_CHAT_MODEL = "xiaomi/mimo-v2.6-flash"

// Reputable zero-cost OpenRouter models, tried in order until one answers.
export const FREE_CHAT_MODELS = [
  "google/gemma-4-31b-it:free",
  "nvidia/nemotron-3.5-super-vl:free",
  "nvidia/nemotron-3-ultra-550b-a55b:free",
] as const

// USD per million tokens, used to record cost_usd per message.
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  [PAID_CHAT_MODEL]: { input: 0.14, output: 0.28 },
}

export function chatModelsFor(tier: Tier): readonly string[] {
  if (tier === "free") return FREE_CHAT_MODELS
  return [PAID_CHAT_MODEL]
}
