import type { generations } from "../db/schema"
import { completeJSON } from "../llm/openrouter"
import { ASSISTANT_MODEL } from "../llm/models"
import type { VideoModelID } from "../videos/models"
import { isImageModel, type ImageModelID } from "./models"

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

// A character or the location in a run, and how many of its photos the run sends.
export type CastMember = { name: string; images: number }

const imagesLabel = (first: number, count: number) =>
  count === 1 ? `Reference image ${first}` : `Reference images ${first}–${first + count - 1}`

// The opening lines of the prompt of a run with characters or a location. The image model gets each
// character's photos first, then the location's, then the pictures the run works from; the legend
// ties each name to its photos.
export function castLegend(cast: CastMember[], references: number, place?: CastMember) {
  if (cast.length === 0 && !place) return ""
  let next = 1
  const named = (member: CastMember, what: string) => {
    const line = `${imagesLabel(next, member.images)}: ${what}.`
    next += member.images
    return line
  }
  const lines = [
    ...cast.map((member) => named(member, member.name)),
    ...(place ? [named(place, `${place.name}, the place where the scene is set`)] : []),
  ]
  if (references > 0)
    lines.push(`${imagesLabel(next, references)}: the picture${references > 1 ? "s" : ""} to work from.`)
  // Photos used whole made the person pose as in them, usually facing the camera: they are for the
  // identity alone, and the prompt sets the pose and the gaze.
  const whose = cast.length === 1 ? `${cast[0]!.name}'s reference images` : "each character's reference images"
  if (cast.length)
    lines.push(
      `Use ${whose} only for who they are: keep their face, facial features, skin tone, hairstyle and build, and their clothes unless the prompt below changes them. Do not copy the pose, head angle, gaze, expression, framing, background or light of those photos.`,
    )
  // A place is kept the way it is built and lit, not the way it was photographed: the scene may see
  // it from anywhere, and the people who happened to be there are not part of it.
  if (place)
    lines.push(
      `Use the reference images of ${place.name} only for the place: keep its layout, architecture, materials, colors and light unless the prompt below changes them, and leave out any people in them. The camera may see it from another angle or distance.`,
    )
  return lines.join("\n")
}

// Names a translation tends to swap: on production "cành đào" (a peach branch, pink) came out as an
// apricot branch, which in Vietnamese is hoa mai (yellow).
const EXACT_NAMES =
  "- Name Vietnamese things exactly: cành đào or hoa đào is a pink peach blossom branch, hoa mai a yellow apricot blossom."

// Left to themselves, image and video models give people glossy, poreless skin and razor-sharp,
// shiny frames: the owner found today's clips "too AI". Real skin and, for a clip, the softer look of
// film stock read as filmed by a person.
const REAL_SKIN =
  "real skin: matte, with visible pores, fine lines and uneven tone, never glossy, waxy, plastic or airbrushed"

// Where people are has to be said, not implied: "seen past a waiting customer, looking across the
// counter" became a barista sitting at a café table like a customer.
const PLACES =
  "- When people or things have places in the scene, say plainly where each one is, whether they stand or sit, and what is between them (for example: the barista stands behind a tall counter, the customer stands in front of it)."

// The rewrite translates and clarifies; it must not stage the picture. Embellished prompts ("a
// subtle smile", "50mm lens", "shallow depth of field", a change of clothes) made people pose and
// look at the camera, which reads as a stock photo, and drifted edits away from the reference.
// What does make a picture believable is plain detail about what is already there: where its light
// comes from, the texture of its surfaces, and, for an everyday photo, how a person took it.
function rewriteRules(
  model: ImageModelID,
  aspectRatio: string,
  references: number,
  cast: CastMember[],
  place: CastMember | undefined,
  seen: boolean,
) {
  // What the image model gets before the person's own pictures.
  const before = [cast.length ? "the characters' photos" : "", place ? "the location's photos" : ""]
    .filter(Boolean)
    .join(" and ")
  return [
    `When allowed, rewrite the prompt in English for ${model} as a faithful, clear translation:`,
    "- Keep everything the person asked for: subjects, actions, poses, expressions, clothing, counts, named styles and quoted text. Translate the meaning faithfully and no stronger: a faint smile stays faint.",
    EXACT_NAMES,
    PLACES,
    "- Add nothing they did not ask for: no new people, objects, clothes, expressions or gestures, and no camera models, lens, depth-of-field or quality words (8k, masterpiece, ultra-detailed, cinematic).",
    "- Photographs should look natural and believable. Unless they ask for a posed shot such as a portrait or a selfie, a photo shows an ordinary, candid moment: people carry on with what they are doing and do not look at the camera, in the light the place really has.",
    "- For a photograph, say where its light comes from (daylight through a window, a street lamp, a ceiling light, a camera flash only if they ask for one) and name the real texture of what is already there (skin, fabric, worn wood, wet ground) in a few plain words. When they want an everyday, real-life photo, say how a person took it: a phone snapshot, at eye level or slightly tilted, with ordinary framing.",
    `- In a photograph, people have ${REAL_SKIN}. Keep the photograph true to life: natural colors and contrast, no HDR glow, no over-sharpening.`,
    ...savedRules(cast, place, "picture"),
    references > 0
      ? pictureRules(references, before, seen)
      : `- Fill in only what the picture needs and they left open (${place ? "light, framing, mood" : "setting, light, framing, mood"}), briefly and plainly.`,
    `- The picture is ${aspectRatio}, ${orientation(aspectRatio)}: compose for that frame, without writing the ratio.`,
    `- At most 110 words, no preamble. ${STYLE_HINTS[model]}`,
  ]
    .filter(Boolean)
    .join("\n")
}

// A clip is read as it plays: what moves, in what order, and what it sounds like. The same faithful
// translation as for pictures, so nothing the person did not ask for gets staged. A real-life scene
// looks filmed by a person when the camera behaves like one: it sways a little, follows the action,
// refocuses and lets the exposure catch up with the light, where a machine glides evenly.
function videoRules(
  model: VideoModelID,
  aspectRatio: string,
  clip: { seconds: number; sound: boolean; lastFrame?: boolean },
  references: number,
  cast: CastMember[],
  place: CastMember | undefined,
  seen: boolean,
) {
  return [
    `When allowed, rewrite the prompt in English for ${model} as a faithful, clear description of a ${clip.seconds}-second video clip:`,
    "- Keep everything the person asked for: subjects, actions, expressions, clothing, counts, named styles and quoted text. Translate the meaning faithfully and no stronger.",
    EXACT_NAMES,
    PLACES,
    `- Say what happens during the clip, in order: who or what moves and how. Keep to what fits in ${clip.seconds} seconds.`,
    "- Add nothing they did not ask for: no new people or objects, and no quality words (8k, masterpiece, cinematic).",
    "- Say how the camera moves, as the person holding it would, in plain words and at most two moves. Use the move they ask for. For a real-life scene of people (everyday life, family, street, a vlog, a documentary) the camera is handheld, with a slight natural sway, and does what the scene needs of these: follows the action, refocuses from one subject to another, lets its exposure adjust when the light changes, swings quickly toward something sudden. For a staged, product or animated scene, one steady move (a static shot, a slow push-in, a pan to the left).",
    `- In a real-life scene, people have ${REAL_SKIN}. Unless they ask for another look (a phone video, a crisp commercial, animation), a real-life scene looks shot on 35mm film: a little soft rather than razor-sharp, with fine natural grain, muted true-to-life colors and highlights that roll off gently.`,
    "- Unless they ask for a posed shot, people carry on with what they are doing and do not look at the camera, in the light the place really has. Say where that light comes from and name the textures that move or catch it (hair, fabric, steam, water, dust) in a few plain words.",
    clip.sound
      ? "- The clip has sound: name the sounds that belong to the scene in a few words. Put words someone says in double quotes, exactly as given, and say who says them and in which language. Never make up words for anyone to say: people chatting or laughing stays a sound."
      : "",
    ...savedRules(cast, place, "clip"),
    references > 0
      ? frameRule(clip.lastFrame === true, seen)
      : `- Fill in only what the clip needs and they left open (${place ? "light, mood" : "setting, light, mood"}), briefly and plainly.`,
    `- The video is ${aspectRatio}, ${orientation(aspectRatio)}: compose for that frame, without writing the ratio.`,
    "- At most 120 words, no preamble. Write plain sentences.",
  ]
    .filter(Boolean)
    .join("\n")
}

// The saved characters and location a picture or a clip features: the model gets their photos, so the
// rewrite calls them by name and does not describe them.
function savedRules(cast: CastMember[], place: CastMember | undefined, made: "picture" | "clip") {
  const reader = made === "clip" ? "video model" : "image model"
  const names = cast.map((member) => `"${member.name}"`).join(" and ")
  return [
    cast.length
      ? `- The ${made} features ${names}, ${cast.length === 1 ? "a saved character" : "saved characters"} whose photos the ${reader} gets with a note saying which is which. Call each one by that name, and do not describe their face, hair, body or clothes unless the person asks to change them: the photos show them. Say what each one is doing, where they are in the frame and what they are looking at, which is not the camera unless the person asks for a posed shot.`
      : "",
    place
      ? `- The scene is set in "${place.name}", a saved location whose photos the ${reader} gets with a note. Call it by that name, and do not describe how it looks unless the person asks to change it: the photos show it.`
      : "",
  ]
}

// The pictures a clip starts from and, with a last frame, ends on: the model sees them, so the rewrite
// says what moves between them instead of describing them.
function frameRule(lastFrame: boolean, seen: boolean) {
  if (lastFrame) {
    return `- The clip starts on the first picture they attached and ends on the second${seen ? ", both shown after their words" : ", which you cannot see"}. Do not describe them again: say how the scene moves and changes from the first frame to the last, and that the people, things and setting in them stay as they are unless they ask otherwise.`
  }
  return `- The clip starts from the picture they attached${seen ? ", shown after their words" : ", which you cannot see"}. Do not describe it again: say what moves and changes from that first frame, and that the people, things and setting in it stay as they are unless they ask otherwise.`
}

// What the person's own pictures are for. Read as edits to keep "exactly as they are", a portrait
// attached to put someone in a new scene passed on its framing, head angle and gaze: the man cooked
// while staring into the camera.
function pictureRules(references: number, after: string, seen: boolean) {
  const attached = after
    ? `They also attached ${references} picture(s) to work from, numbered after ${after}`
    : `They attached ${references} reference image(s)`
  const name = after ? '"the picture to work from"' : '"the reference image"'
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
  | "status"
  | "prompt_raw"
  | "prompt_enhanced"
  | "model"
  | "reference_file_ids"
  | "character_ids"
  | "location_id"
  | "enhance"
>

// Retrying a failed run sends the image model the prompt that run was given: it passed the
// screening and was rewritten for the same words, model, references, characters and location, so a
// second call would only add a wait and its cost. Anything else gets screened and rewritten afresh.
export function reusableRewrite(
  previous: Previous | undefined,
  request: {
    prompt: string
    model: string
    referenceIDs: string[]
    characterIDs: string[]
    locationID: string | null
    enhance: boolean
  },
) {
  if (previous?.status !== "failed" || !previous.prompt_enhanced) return undefined
  const same =
    previous.prompt_raw === request.prompt &&
    previous.model === request.model &&
    previous.reference_file_ids === JSON.stringify(request.referenceIDs) &&
    previous.character_ids === JSON.stringify(request.characterIDs) &&
    previous.location_id === request.locationID &&
    previous.enhance === (request.enhance ? 1 : 0)
  return same ? previous.prompt_enhanced : undefined
}

export async function enhancePrompt(input: {
  apiKey: string
  baseURL?: string
  model: ImageModelID | VideoModelID
  // Set for a video run: the clip's length, whether the model makes sound, and whether it ends on a
  // picture as well as starting from one.
  clip?: { seconds: number; sound: boolean; lastFrame?: boolean }
  prompt: string
  rewrite: boolean
  aspectRatio: string
  // The pictures the run works from, besides the photos of its characters and its location.
  references: number
  cast?: CastMember[]
  // The saved location the picture or the clip is set in.
  place?: CastMember
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
    `You prepare prompts for an AI ${isImageModel(input.model) ? "image" : "video"} generator and screen them for policy.`,
    'Reply with JSON only: {"allowed": boolean, "reason": string, "prompt": string}.',
    "Set allowed=false (and explain briefly in Vietnamese in reason) for: sexual content involving minors, sexual deepfakes or nudity of real identifiable people, gore or graphic violence, hate symbols or propaganda, instructions for weapons or drugs. Everything else is allowed, including artistic nudity-free portraits of public figures in neutral contexts.",
    pictures.length ? "Judge their words together with the pictures they attached." : "",
    !input.rewrite
      ? "When allowed, return the user's prompt unchanged in prompt (translate to English only if it is not already English; keep quoted text exactly)."
      : isImageModel(input.model)
        ? rewriteRules(input.model, input.aspectRatio, input.references, cast, input.place, pictures.length > 0)
        : videoRules(
            input.model,
            input.aspectRatio,
            input.clip ?? { seconds: 5, sound: false },
            input.references,
            cast,
            input.place,
            pictures.length > 0,
          ),
  ]
    .filter(Boolean)
    .join("\n")
  // The person's pictures come after the characters' and the location's photos in what the image
  // model gets.
  const firstPicture =
    1 + [...cast, ...(input.place ? [input.place] : [])].reduce((sum, member) => sum + member.images, 0)
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
