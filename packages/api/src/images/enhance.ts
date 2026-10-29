import { completeJSON } from "../llm/openrouter"
import { PAID_CHAT_MODEL } from "../plans"
import type { ImageModelID } from "./models"

export type EnhanceResult = {
  allowed: boolean
  reason?: string
  // The prompt to send to the image model; equals the input when rewriting is off or failed.
  prompt: string
  // True when the enhancer produced the prompt (false on timeout / parse failure / rewrite off).
  rewritten: boolean
  // What the screening and rewrite call cost; it starts the generation's cost_usd.
  costUsd: number
}

// Cheap first pass before spending an LLM call. Keep it narrow: the enhancer does the real check.
const DENYLIST = [
  /\b(child|children|kid|kids|minor|minors|toddler|preteen|underage|loli|shota)\b[^.]{0,80}\b(nude|naked|sex|sexual|porn|erotic|lingerie)\b/i,
  /\b(nude|naked|sex|sexual|porn|erotic)\b[^.]{0,80}\b(child|children|kid|kids|minor|minors|toddler|preteen|underage)\b/i,
  /(trẻ em|trẻ con|bé gái|bé trai|học sinh)[^.]{0,60}(khỏa thân|khoả thân|sex|khiêu dâm|gợi cảm)/i,
  /(khỏa thân|khoả thân|sex|khiêu dâm)[^.]{0,60}(trẻ em|trẻ con|bé gái|bé trai)/i,
]

export function blockedByDenylist(prompt: string) {
  return DENYLIST.some((rule) => rule.test(prompt))
}

const STYLE_HINTS: Record<ImageModelID, string> = {
  "flux-3-klein":
    "Write one dense descriptive paragraph (not a conversation): subject, setting, composition, lighting, lens, materials, colour palette.",
  "nano-banana-2.1":
    "If reference images are provided, write it as an editing instruction that keeps the identity, pose and style of the references. Otherwise write a vivid natural description.",
  "gpt-image-2.5":
    "Use natural language. If the user asks for text in the image, quote the exact text in double quotes and describe its placement and typography.",
}

export const ENHANCE_MODEL = PAID_CHAT_MODEL

export async function enhancePrompt(input: {
  apiKey: string
  baseURL?: string
  model: ImageModelID
  prompt: string
  rewrite: boolean
  references: number
}): Promise<EnhanceResult> {
  if (blockedByDenylist(input.prompt)) {
    return { allowed: false, reason: "Nội dung không được phép", prompt: input.prompt, rewritten: false, costUsd: 0 }
  }
  const system = [
    "You prepare prompts for an AI image generator and screen them for policy.",
    'Reply with JSON only: {"allowed": boolean, "reason": string, "prompt": string}.',
    "Set allowed=false (and explain briefly in Vietnamese in reason) for: sexual content involving minors, sexual deepfakes or nudity of real identifiable people, gore or graphic violence, hate symbols or propaganda, instructions for weapons or drugs. Everything else is allowed, including artistic nudity-free portraits of public figures in neutral contexts.",
    input.rewrite
      ? `When allowed, rewrite the prompt in English for ${input.model}: keep the user's subject, intent, named styles and any quoted text exactly; translate from Vietnamese if needed; add composition, lighting, lens or medium details only where the user left them open; at most 120 words; no preamble. ${STYLE_HINTS[input.model]}`
      : "When allowed, return the user's prompt unchanged in prompt (translate to English only if it is not already English; keep quoted text exactly).",
    input.references > 0
      ? `The user attached ${input.references} reference image(s); the prompt should refer to them as "the reference image(s)".`
      : "",
  ]
    .filter(Boolean)
    .join("\n")
  const reply = await completeJSON({
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    model: ENHANCE_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: input.prompt },
    ],
    maxTokens: 350,
    temperature: 0.4,
    timeoutMs: 8000,
  }).catch(() => ({ value: undefined, costUsd: 0 }))
  const { value: result, costUsd } = reply
  if (!result || typeof result.allowed !== "boolean") {
    return { allowed: true, prompt: input.prompt, rewritten: false, costUsd }
  }
  if (!result.allowed) {
    const reason = typeof result.reason === "string" && result.reason ? result.reason : "Nội dung không được phép"
    return { allowed: false, reason, prompt: input.prompt, rewritten: false, costUsd }
  }
  const prompt = typeof result.prompt === "string" ? result.prompt.trim() : ""
  if (!prompt || prompt === input.prompt.trim()) {
    return { allowed: true, prompt: input.prompt, rewritten: false, costUsd }
  }
  return { allowed: true, prompt, rewritten: true, costUsd }
}
