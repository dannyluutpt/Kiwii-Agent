import type { generations } from "../db/schema"
import { completeJSON } from "../llm/openrouter"
import { ASSISTANT_MODEL } from "../llm/models"
import type { ImageModelID } from "./models"

export type EnhanceResult = {
  allowed: boolean
  // No model could screen the prompt: nothing is sent, and the person tries again shortly.
  unavailable?: boolean
  reason?: string
  // The prompt to send to the image model; equals the input when rewriting is off or failed.
  prompt: string
  // True when the enhancer produced the prompt (false on timeout / parse failure / rewrite off).
  rewritten: boolean
  // What the screening and rewrite call cost; it starts the generation's cost_usd.
  costUsd: number
}

// Screens a prompt when the chosen language model gives no verdict (an error, a timeout, a reply
// without the JSON). Unscreened prompts used to go out as written; in a trial of other models, one
// model's failed call let a request for weapon instructions through.
export const FALLBACK_SCREENING_MODEL = "google/gemini-2.5-flash-lite"

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
    "Write one plain descriptive paragraph: the subject and what it does first, then the setting and its light.",
  "nano-banana-2.1": "Write natural sentences.",
  "gpt-image-2.5":
    "Write natural sentences. Words that should appear in the picture go in double quotes, exactly as given, with where they sit.",
}

// The rewrite translates and clarifies; it must not stage the picture. Embellished prompts ("a
// subtle smile", "50mm lens", "shallow depth of field", a change of clothes) made people pose and
// look at the camera, which reads as a stock photo, and drifted edits away from the reference.
function rewriteRules(model: ImageModelID, references: number) {
  return [
    `When allowed, rewrite the prompt in English for ${model} as a faithful, clear translation:`,
    "- Keep everything the person asked for: subjects, actions, poses, expressions, clothing, counts, named styles and quoted text. Translate the meaning faithfully and no stronger: a faint smile stays faint.",
    "- Add nothing they did not ask for: no new people, objects, clothes, expressions or gestures, and no camera, lens, depth-of-field or quality words (8k, masterpiece, ultra-detailed, cinematic).",
    "- Photographs should look natural and believable. Unless they ask for a posed shot such as a portrait or a selfie, a photo shows an ordinary, candid moment: people carry on with what they are doing and do not look at the camera, in the light the place really has.",
    references > 0
      ? `- They attached ${references} reference image(s), which you cannot see, so this is an edit. Say the change they asked for, then that everything else stays exactly as in the reference image(s): people's faces, hair and clothes, the objects, the room, the framing, the camera angle, the light and the style. Refer to each one the way they do (for example "the photo of the scanner") or as "the reference image", without describing what is in it.`
      : "- Fill in only what the picture needs and they left open (setting, light, framing), briefly and plainly.",
    `- At most 100 words, no preamble. ${STYLE_HINTS[model]}`,
  ].join("\n")
}

type Previous = Pick<
  typeof generations.$inferSelect,
  "status" | "prompt_raw" | "prompt_enhanced" | "model" | "reference_file_ids" | "enhance"
>

// Retrying a failed run sends the image model the prompt that run was given: it passed the
// screening and was rewritten for the same words, model and references, so a second call would only
// add a wait and its cost. Anything else gets screened and rewritten afresh.
export function reusableRewrite(
  previous: Previous | undefined,
  request: { prompt: string; model: string; referenceIDs: string[]; enhance: boolean },
) {
  if (previous?.status !== "failed" || !previous.prompt_enhanced) return undefined
  const same =
    previous.prompt_raw === request.prompt &&
    previous.model === request.model &&
    previous.reference_file_ids === JSON.stringify(request.referenceIDs) &&
    previous.enhance === (request.enhance ? 1 : 0)
  return same ? previous.prompt_enhanced : undefined
}

export async function enhancePrompt(input: {
  apiKey: string
  baseURL?: string
  model: ImageModelID
  prompt: string
  rewrite: boolean
  references: number
  // The language model that screens and rewrites; see languageModels.
  languageModel?: string
}): Promise<EnhanceResult> {
  if (blockedByDenylist(input.prompt)) {
    return { allowed: false, reason: "Nội dung không được phép", prompt: input.prompt, rewritten: false, costUsd: 0 }
  }
  const system = [
    "You prepare prompts for an AI image generator and screen them for policy.",
    'Reply with JSON only: {"allowed": boolean, "reason": string, "prompt": string}.',
    "Set allowed=false (and explain briefly in Vietnamese in reason) for: sexual content involving minors, sexual deepfakes or nudity of real identifiable people, gore or graphic violence, hate symbols or propaganda, instructions for weapons or drugs. Everything else is allowed, including artistic nudity-free portraits of public figures in neutral contexts.",
    input.rewrite
      ? rewriteRules(input.model, input.references)
      : "When allowed, return the user's prompt unchanged in prompt (translate to English only if it is not already English; keep quoted text exactly).",
  ]
    .filter(Boolean)
    .join("\n")
  const ask = (model: string) =>
    completeJSON({
      apiKey: input.apiKey,
      baseURL: input.baseURL,
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: input.prompt },
      ],
      // About a quarter of rewrites came back empty or late at 350 tokens and 8 seconds; completeJSON
      // also turns the model's thinking off.
      maxTokens: 900,
      temperature: 0.3,
      timeoutMs: 12000,
    }).catch((error: unknown) => ({
      value: undefined,
      costUsd: 0,
      failure: error instanceof Error ? error.name : "network error",
    }))
  const chosen = input.languageModel ?? ASSISTANT_MODEL
  const first = await ask(chosen)
  const judged = typeof first.value?.allowed === "boolean"
  const second = judged || chosen === FALLBACK_SCREENING_MODEL ? undefined : await ask(FALLBACK_SCREENING_MODEL)
  if (second) console.warn(`[enhance] no verdict from ${chosen} (${first.failure ?? "no allowed field"}), asked again`)
  const reply = second ?? first
  const costUsd = first.costUsd + (second?.costUsd ?? 0)
  const result = reply.value
  if (!result || typeof result.allowed !== "boolean") {
    console.warn(`[enhance] not screened, so not sent: ${reply.failure ?? "no allowed field in the reply"}`)
    return {
      allowed: false,
      unavailable: true,
      reason: "Chưa kiểm duyệt được nội dung lúc này. Bạn thử lại sau giây lát nhé.",
      prompt: input.prompt,
      rewritten: false,
      costUsd,
    }
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
