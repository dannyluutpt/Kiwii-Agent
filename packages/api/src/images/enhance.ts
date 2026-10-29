import type { generations } from "../db/schema"
import { completeJSON } from "../llm/openrouter"
import { ASSISTANT_MODEL } from "../llm/models"
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
    "Write one plain descriptive paragraph: the subject and what it does first, then the setting and its light.",
  "nano-banana-2.1": "Write natural sentences.",
  "gpt-image-2.5":
    "Write natural sentences. Words that should appear in the picture go in double quotes, exactly as given, with where they sit.",
}

// A character in a run, and how many of its photos the run sends.
export type CastMember = { name: string; images: number }

const imagesLabel = (first: number, count: number) =>
  count === 1 ? `Reference image ${first}` : `Reference images ${first}–${first + count - 1}`

// The opening lines of the prompt of a run with characters. The image model gets each character's
// photos first, then the pictures the run works from; the legend ties each name to its photos.
export function castLegend(cast: CastMember[], references: number) {
  if (cast.length === 0) return ""
  let next = 1
  const lines = cast.map((member) => {
    const line = `${imagesLabel(next, member.images)}: ${member.name}.`
    next += member.images
    return line
  })
  if (references > 0)
    lines.push(`${imagesLabel(next, references)}: the picture${references > 1 ? "s" : ""} to work from.`)
  // Photos used whole made the person pose as in them, usually facing the camera: they are for the
  // identity alone, and the prompt sets the pose and the gaze.
  const whose = cast.length === 1 ? `${cast[0]!.name}'s reference images` : "each character's reference images"
  lines.push(
    `Use ${whose} only for who they are: keep their face, facial features, skin tone, hairstyle and build, and their clothes unless the prompt below changes them. Do not copy the pose, head angle, gaze, expression, framing, background or light of those photos.`,
  )
  return lines.join("\n")
}

// The rewrite translates and clarifies; it must not stage the picture. Embellished prompts ("a
// subtle smile", "50mm lens", "shallow depth of field", a change of clothes) made people pose and
// look at the camera, which reads as a stock photo, and drifted edits away from the reference.
function rewriteRules(model: ImageModelID, references: number, cast: CastMember[]) {
  const names = cast.map((member) => `"${member.name}"`).join(" and ")
  return [
    `When allowed, rewrite the prompt in English for ${model} as a faithful, clear translation:`,
    "- Keep everything the person asked for: subjects, actions, poses, expressions, clothing, counts, named styles and quoted text. Translate the meaning faithfully and no stronger: a faint smile stays faint.",
    "- Add nothing they did not ask for: no new people, objects, clothes, expressions or gestures, and no camera, lens, depth-of-field or quality words (8k, masterpiece, ultra-detailed, cinematic).",
    "- Photographs should look natural and believable. Unless they ask for a posed shot such as a portrait or a selfie, a photo shows an ordinary, candid moment: people carry on with what they are doing and do not look at the camera, in the light the place really has.",
    cast.length
      ? `- The picture features ${names}, saved characters whose photos the image model gets with a note saying which is which. Call each one by that name, and do not describe their face, hair, body or clothes unless the person asks to change them: the photos show them. Say what each one is doing, where they are in the frame and what they are looking at, which is not the camera unless the person asks for a posed shot.`
      : "",
    references > 0 && cast.length
      ? `- They also attached ${references} picture(s) to work from, which you cannot see, so this is an edit. Say the change they asked for, then that everything else stays exactly as in the picture(s) to work from: the objects, the room, the framing, the camera angle, the light and the style. Call them "the picture to work from", without describing what is in them.`
      : "",
    references > 0 && !cast.length
      ? `- They attached ${references} reference image(s), which you cannot see, so this is an edit. Say the change they asked for, then that everything else stays exactly as in the reference image(s): people's faces, hair and clothes, the objects, the room, the framing, the camera angle, the light and the style. Refer to each one the way they do (for example "the photo of the scanner") or as "the reference image", without describing what is in it.`
      : "",
    references === 0
      ? "- Fill in only what the picture needs and they left open (setting, light, framing), briefly and plainly."
      : "",
    `- At most 100 words, no preamble. ${STYLE_HINTS[model]}`,
  ]
    .filter(Boolean)
    .join("\n")
}

type Previous = Pick<
  typeof generations.$inferSelect,
  "status" | "prompt_raw" | "prompt_enhanced" | "model" | "reference_file_ids" | "character_ids" | "enhance"
>

// Retrying a failed run sends the image model the prompt that run was given: it passed the
// screening and was rewritten for the same words, model and references, so a second call would only
// add a wait and its cost. Anything else gets screened and rewritten afresh.
export function reusableRewrite(
  previous: Previous | undefined,
  request: { prompt: string; model: string; referenceIDs: string[]; characterIDs: string[]; enhance: boolean },
) {
  if (previous?.status !== "failed" || !previous.prompt_enhanced) return undefined
  const same =
    previous.prompt_raw === request.prompt &&
    previous.model === request.model &&
    previous.reference_file_ids === JSON.stringify(request.referenceIDs) &&
    previous.character_ids === JSON.stringify(request.characterIDs) &&
    previous.enhance === (request.enhance ? 1 : 0)
  return same ? previous.prompt_enhanced : undefined
}

export async function enhancePrompt(input: {
  apiKey: string
  baseURL?: string
  model: ImageModelID
  prompt: string
  rewrite: boolean
  // The pictures the run works from, besides the photos of its characters.
  references: number
  cast?: CastMember[]
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
      ? rewriteRules(input.model, input.references, input.cast ?? [])
      : "When allowed, return the user's prompt unchanged in prompt (translate to English only if it is not already English; keep quoted text exactly).",
  ]
    .filter(Boolean)
    .join("\n")
  const reply = await completeJSON({
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    model: input.languageModel ?? ASSISTANT_MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: input.prompt },
    ],
    // About a quarter of rewrites came back empty or late at 350 tokens and 8 seconds, and those runs
    // went out unscreened and unrewritten; completeJSON now also turns the model's thinking off.
    maxTokens: 900,
    temperature: 0.3,
    timeoutMs: 12000,
  }).catch((error: unknown) => ({
    value: undefined,
    costUsd: 0,
    failure: error instanceof Error ? error.name : "network error",
  }))
  const { value: result, costUsd } = reply
  if (!result || typeof result.allowed !== "boolean") {
    console.warn(`[enhance] kept the prompt as written: ${reply.failure ?? "no allowed field in the reply"}`)
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
