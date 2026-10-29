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
function rewriteRules(model: ImageModelID, aspectRatio: string, references: number, cast: CastMember[], seen: boolean) {
  const names = cast.map((member) => `"${member.name}"`).join(" and ")
  return [
    `When allowed, rewrite the prompt in English for ${model} as a faithful, clear translation:`,
    "- Keep everything the person asked for: subjects, actions, poses, expressions, clothing, counts, named styles and quoted text. Translate the meaning faithfully and no stronger: a faint smile stays faint.",
    "- Add nothing they did not ask for: no new people, objects, clothes, expressions or gestures, and no camera, lens, depth-of-field or quality words (8k, masterpiece, ultra-detailed, cinematic).",
    "- Photographs should look natural and believable. Unless they ask for a posed shot such as a portrait or a selfie, a photo shows an ordinary, candid moment: people carry on with what they are doing and do not look at the camera, in the light the place really has.",
    cast.length
      ? `- The picture features ${names}, ${cast.length === 1 ? "a saved character" : "saved characters"} whose photos the image model gets with a note saying which is which. Call each one by that name, and do not describe their face, hair, body or clothes unless the person asks to change them: the photos show them. Say what each one is doing, where they are in the frame and what they are looking at, which is not the camera unless the person asks for a posed shot.`
      : "",
    references > 0
      ? pictureRules(references, cast.length > 0, seen)
      : "- Fill in only what the picture needs and they left open (setting, light, framing), briefly and plainly.",
    `- The picture is ${aspectRatio}, ${orientation(aspectRatio)}: compose for that frame, without writing the ratio.`,
    `- At most 100 words, no preamble. ${STYLE_HINTS[model]}`,
  ]
    .filter(Boolean)
    .join("\n")
}

// What the person's own pictures are for. Read as edits to keep "exactly as they are", a portrait
// attached to put someone in a new scene passed on its framing, head angle and gaze: the man cooked
// while staring into the camera.
function pictureRules(references: number, afterCast: boolean, seen: boolean) {
  const attached = afterCast
    ? `They also attached ${references} picture(s) to work from, numbered after the characters' photos`
    : `They attached ${references} reference image(s)`
  const name = afterCast ? '"the picture to work from"' : '"the reference image"'
  return [
    seen
      ? `- ${attached}, shown after their words with those numbers. From their words and what each picture shows, decide what it is for:`
      : `- ${attached}, which you cannot see. From their words, decide what each one is for:`,
    "  - The picture to change (a new background, light, color or season, something added or removed, or someone put into it): say the change, then that everything else in that picture stays exactly as it is: the people in it with their faces, hair and clothes, the objects, the room, the framing, the camera angle, the light and the style. Remove, replace or move no one unless they ask. Someone put into it joins the people already there, doing something that fits the scene, without the pose or gaze of the photo they come from.",
    "  - Someone or something to show in a new scene: keep only who or what it is (a person's face, facial features, skin tone, hairstyle and build, and their clothes unless they ask for others; an object's shape, colors and markings), and say not to copy that photo's pose, head angle, gaze, expression, framing, background or light. Say what each person is doing and what they are looking at, which is not the camera unless they ask for a posed shot.",
    // Seen, a picture lets the rewrite name what the person points at ("the gray shirt"), but a
    // description of the rest would compete with the picture the image model gets.
    seen
      ? `  Refer to each one by its number or as ${name}. When you mention something in it, name it in a few words as it looks there (for example "the man in the gray shirt" or "the coffee bag"), and describe no more of it: the image model sees the picture. Do not copy out text already written in a picture: the image model reads it there, and a copy with a slip would change it.`
      : `  Refer to each one the way they do (for example "the photo of the scanner") or as ${name}, without describing what is in it.`,
  ].join("\n")
}

// The person's words, then each picture after the number the image model knows it by.
function withPictures(prompt: string, pictures: string[], first: number) {
  return [
    { type: "text" as const, text: prompt },
    ...pictures.flatMap((url, index) => [
      { type: "text" as const, text: `Reference image ${first + index}:` },
      { type: "image_url" as const, image_url: { url } },
    ]),
  ]
}

const orientation = (ratio: string) => {
  const [w = 1, h = 1] = ratio.split(":").map(Number)
  return w > h ? "landscape" : w < h ? "portrait" : "square"
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
  aspectRatio: string
  // The pictures the run works from, besides the photos of its characters.
  references: number
  cast?: CastMember[]
  // Small copies of those pictures (data URLs, in order) for the screening and rewrite to look at.
  // Without them it only knows how many there are.
  pictures?: string[]
  // The language model that screens and rewrites; see languageModels.
  languageModel?: string
}): Promise<EnhanceResult> {
  if (blockedByDenylist(input.prompt)) {
    return { allowed: false, reason: "Nội dung không được phép", prompt: input.prompt, rewritten: false, costUsd: 0 }
  }
  const pictures = input.pictures ?? []
  const cast = input.cast ?? []
  const system = [
    "You prepare prompts for an AI image generator and screen them for policy.",
    'Reply with JSON only: {"allowed": boolean, "reason": string, "prompt": string}.',
    "Set allowed=false (and explain briefly in Vietnamese in reason) for: sexual content involving minors, sexual deepfakes or nudity of real identifiable people, gore or graphic violence, hate symbols or propaganda, instructions for weapons or drugs. Everything else is allowed, including artistic nudity-free portraits of public figures in neutral contexts.",
    pictures.length ? "Judge their words together with the pictures they attached." : "",
    input.rewrite
      ? rewriteRules(input.model, input.aspectRatio, input.references, cast, pictures.length > 0)
      : "When allowed, return the user's prompt unchanged in prompt (translate to English only if it is not already English; keep quoted text exactly).",
  ]
    .filter(Boolean)
    .join("\n")
  // The person's pictures come after the characters' photos in what the image model gets.
  const firstPicture = 1 + cast.reduce((sum, member) => sum + member.images, 0)
  const ask = (model: string) =>
    completeJSON({
      apiKey: input.apiKey,
      baseURL: input.baseURL,
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: pictures.length ? withPictures(input.prompt, pictures, firstPicture) : input.prompt },
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
