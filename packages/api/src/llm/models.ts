import { eq } from "drizzle-orm"
import type { Database } from "../db/client"
import { app_config } from "../db/schema"

// The language model behind the image assistant and the prompt screening and rewriting. Its
// thinking must be optional on OpenRouter (reasoning.mandatory false): completeJSON turns it off.
export const ASSISTANT_MODEL = "xiaomi/mimo-v2.6-flash"

type ModelChoice = { assistant?: string; rewrite?: string }

// app_config.llm_models = { "assistant": "<OpenRouter slug>", "rewrite": "…", "accounts": { "<user id>":
// { "assistant": "…", "rewrite": "…" } } } swaps either model without a deploy: for everyone, or for
// one account first, so a model can be tried on production before everyone gets it.
export async function languageModels(db: Database, userID: string) {
  const row = await db
    .select({ value: app_config.value })
    .from(app_config)
    .where(eq(app_config.key, "llm_models"))
    .get()
  const config = row ? parseChoice(row.value) : {}
  const own = config.accounts?.[userID]
  return {
    assistant: own?.assistant ?? config.assistant ?? ASSISTANT_MODEL,
    rewrite: own?.rewrite ?? config.rewrite ?? ASSISTANT_MODEL,
  }
}

function parseChoice(text: string): ModelChoice & { accounts?: Record<string, ModelChoice> } {
  try {
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === "object"
      ? (parsed as ModelChoice & { accounts?: Record<string, ModelChoice> })
      : {}
  } catch {
    return {}
  }
}
