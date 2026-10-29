import { and, eq, inArray, sql } from "drizzle-orm"
import { ulid } from "ulid"
import { z } from "zod"
import { ApiError, type User } from "../app"
import { castPhotos, MAX_CHARACTERS_PER_RUN, ownCharacters } from "../characters/store"
import { balance, reserve } from "../credits/ledger"
import { TRIAL_MODELS, TRIAL_OPTIONS } from "../credits/trial"
import type { Database } from "../db/client"
import { files, generations } from "../db/schema"
import { languageModels } from "../llm/models"
import { loadPlan } from "../plans"
import { ownProject, touchProject } from "../projects/store"
import { castLegend, enhancePrompt, reusableRewrite } from "./enhance"
import { reapStaleGenerations } from "./generate"
import { glance } from "./glance"
import { imageCreditCost, ImageModelID, loadImageModels, MAX_IMAGES_PER_RUN, MAX_REFERENCES } from "./models"
import type { ImageReference } from "./openrouter-images"
import { IMAGE_MIMES, toDataURL } from "./r2"

export const CreateGeneration = z.object({
  model: z.enum(ImageModelID),
  option: z.string().min(1).max(10),
  aspectRatio: z.string().regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/),
  n: z.number().int().min(1).max(MAX_IMAGES_PER_RUN).default(1),
  prompt: z.string().trim().min(1).max(4000),
  enhance: z.boolean().default(true),
  referenceFileIDs: z.array(z.string().min(1).max(40)).max(MAX_REFERENCES).default([]),
  // Saved characters in the picture; their photos lead the references.
  characterIDs: z.array(z.string().min(1).max(40)).max(MAX_CHARACTERS_PER_RUN).default([]),
  // The failed run this one retries; its rewritten prompt is reused when it still applies.
  retryOf: z.string().min(1).max(40).optional(),
  // The project the run belongs to; without one it shows only under "all".
  projectID: z.string().min(1).max(40).optional(),
})

// Paid plans use their plan limit and every model. A free account with leftover trial (or
// top-up) credits may run one generation at a time, on the trial model at its lowest setting.
export function imageAccess(parallelLimit: number, credits: number) {
  const limited = {
    models: TRIAL_MODELS as readonly string[] | null,
    options: TRIAL_OPTIONS as readonly string[] | null,
  }
  if (parallelLimit > 0) return { parallelLimit, models: null, options: null, trial: false }
  if (credits > 0) return { parallelLimit: 1, ...limited, trial: true }
  return { parallelLimit: 0, ...limited, trial: false }
}

export function accessAllows(access: ReturnType<typeof imageAccess>, model: string, option: string) {
  return (access.models?.includes(model) ?? true) && (access.options?.includes(option) ?? true)
}

// Everything between a request for pictures and the run itself: who may run what and how many at
// once, the price, the project, the references, the screening and rewrite, the credit hold and the
// row. Whatever the person must fix throws an ApiError, and no credit moves before every check passed.
export async function prepareGeneration(input: {
  db: Database
  bucket: R2Bucket
  // Makes the small copies of the pictures that the screening and rewrite look at.
  images?: ImagesBinding
  apiKey: string
  baseURL?: string
  user: User
  request: z.infer<typeof CreateGeneration>
}) {
  const db = input.db
  const body = input.request
  const plan = await loadPlan(db, input.user)
  const access = imageAccess(plan.parallel_limit, await balance(db, input.user.id))
  if (access.parallelLimit === 0) {
    throw new ApiError(403, "IMAGE_REQUIRES_PAID", "Tạo ảnh dành cho gói trả phí. Hãy nâng cấp gói.")
  }
  if (!accessAllows(access, body.model, body.option)) {
    throw new ApiError(403, "IMAGE_REQUIRES_PAID", "Dùng thử chỉ tạo được ảnh FLUX 3 Klein 1K. Hãy nâng cấp gói.")
  }
  const project = body.projectID ? await ownProject(db, input.user.id, body.projectID) : undefined
  const models = await loadImageModels(db)
  const model = models.find((m) => m.id === body.model)!
  const option = model.options.find((o) => o.id === body.option)
  if (!option || option.credits === null) throw new ApiError(400, "INVALID_OPTION", "Tuỳ chọn chất lượng không hợp lệ")
  if (!model.aspectRatios.includes(body.aspectRatio))
    throw new ApiError(400, "INVALID_ASPECT", "Tỷ lệ khung không hợp lệ")
  // The model reads the characters' photos first, then the pictures the run works from, within its
  // limit: each character keeps one photo at least, and takes more while there is room.
  const room = Math.min(model.maxReferences, MAX_REFERENCES)
  const cast = await ownCharacters(db, input.user.id, [...new Set(body.characterIDs)])
  const own = [...new Set(body.referenceFileIDs)]
  const photos = castPhotos(cast, room - own.length)
  const referenceIDs = own.slice(0, Math.max(0, room - photos.flat().length))
  const sent = [...photos.flat(), ...referenceIDs]
  const cost = imageCreditCost(models, {
    model: body.model,
    option: body.option,
    n: body.n,
    references: sent.length,
  })
  if (cost === undefined) throw new ApiError(400, "INVALID_INPUT", "Yêu cầu không hợp lệ")

  await reapStaleGenerations(db)
  const running = await db
    .select({ count: sql<number>`count(*)` })
    .from(generations)
    .where(and(eq(generations.user_id, input.user.id), eq(generations.status, "running")))
    .get()
  if ((running?.count ?? 0) >= access.parallelLimit) {
    throw new ApiError(429, "PARALLEL_LIMIT", `Gói của bạn chạy tối đa ${access.parallelLimit} lượt tạo ảnh cùng lúc`, {
      limit: access.parallelLimit,
    })
  }

  // In the order the legend numbers them.
  const rows = sent.length
    ? await db
        .select({ id: files.id, r2_key: files.r2_key, mime: files.mime })
        .from(files)
        .where(and(eq(files.user_id, input.user.id), inArray(files.id, sent)))
    : []
  const references: ImageReference[] = []
  for (const fileID of sent) {
    const row = rows.find((item) => item.id === fileID)
    const url = row && IMAGE_MIMES.has(row.mime) ? await toDataURL(input.bucket, row.r2_key) : undefined
    if (!url) throw new ApiError(404, "FILE_NOT_FOUND", "Ảnh tham chiếu không tồn tại")
    references.push({ type: "image_url", image_url: { url } })
  }
  const members = cast.map((character, index) => ({ name: character.name, images: photos[index]?.length ?? 0 }))

  // Moderation runs before any credit moves so a blocked prompt costs nothing. A retry of a failed
  // run skips it and reuses that run's screened, rewritten prompt.
  const previous = body.retryOf
    ? await db
        .select()
        .from(generations)
        .where(and(eq(generations.id, body.retryOf), eq(generations.user_id, input.user.id)))
        .get()
    : undefined
  const reused = reusableRewrite(previous, {
    prompt: body.prompt,
    model: body.model,
    referenceIDs,
    characterIDs: cast.map((character) => character.id),
    enhance: body.enhance,
  })
  // The screening and rewrite looks at the pictures the run works from; the legend names the
  // characters' photos. Without small copies it is told only how many pictures there are.
  const images = input.images
  const pictures =
    reused || !images
      ? []
      : await Promise.all(
          referenceIDs.map((fileID) => glance(images, input.bucket, rows.find((row) => row.id === fileID)!.r2_key)),
        ).catch((error: unknown) => {
          console.warn(`[enhance] no small copies of the pictures: ${String(error)}`)
          return []
        })
  const enhanced = reused
    ? { allowed: true, prompt: reused, rewritten: true, costUsd: 0 }
    : await enhancePrompt({
        apiKey: input.apiKey,
        baseURL: input.baseURL,
        model: body.model,
        prompt: body.prompt,
        rewrite: body.enhance,
        aspectRatio: body.aspectRatio,
        references: referenceIDs.length,
        cast: members,
        pictures,
        languageModel: (await languageModels(db, input.user.id)).rewrite,
      })
  if (enhanced.unavailable) throw new ApiError(502, "SCREENING_UNAVAILABLE", enhanced.reason ?? "Hãy thử lại sau")
  if (!enhanced.allowed) throw new ApiError(422, "PROMPT_BLOCKED", enhanced.reason ?? "Nội dung không được phép")

  const id = ulid()
  await reserve(db, {
    userID: input.user.id,
    amount: cost,
    generationID: id,
    reason: `${model.name} ${option.id} ×${body.n}`,
  })
  const now = Date.now()
  await db.insert(generations).values({
    id,
    user_id: input.user.id,
    status: "running",
    model: body.model,
    option: body.option,
    aspect_ratio: body.aspectRatio,
    n: body.n,
    prompt_raw: body.prompt,
    prompt_enhanced: enhanced.rewritten ? enhanced.prompt : null,
    enhance: body.enhance ? 1 : 0,
    // The prompt screening and rewrite was paid for already; the image cost is added on top.
    cost_usd: enhanced.costUsd,
    reference_file_ids: JSON.stringify(referenceIDs),
    character_ids: JSON.stringify(cast.map((character) => character.id)),
    credits_reserved: cost,
    project_id: project?.id ?? null,
    created_at: now,
  })
  if (project) await touchProject(db, project, body.prompt, now)
  const generation = (await db.select().from(generations).where(eq(generations.id, id)).get())!
  return {
    generation,
    model,
    perImageCredits: option.credits,
    references,
    legend: castLegend(members, referenceIDs.length),
  }
}
