import { and, eq, sql } from "drizzle-orm"
import { ulid } from "ulid"
import { z } from "zod"
import { ApiError, type User } from "../app"
import { MAX_CHARACTERS_PER_RUN, ownCharacters } from "../characters/store"
import { reserve } from "../credits/ledger"
import type { Database } from "../db/client"
import { files, generations } from "../db/schema"
import { enhancePrompt } from "../images/enhance"
import { reapStaleGenerations } from "../images/generate"
import { glance } from "../images/glance"
import { savedPhotos } from "../images/prepare"
import { IMAGE_MIMES } from "../images/r2"
import { languageModels } from "../llm/models"
import { ownLocation } from "../locations/store"
import { loadPlan } from "../plans"
import { ownProject, touchProject } from "../projects/store"
import { loadVideoModels, MAX_VIDEO_REFERENCES, VideoModelID, videoCreditCost } from "./models"

export const CreateVideo = z.object({
  model: z.enum(VideoModelID),
  option: z.string().min(1).max(10),
  aspectRatio: z.string().regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/),
  duration: z.number().int().min(1).max(60),
  prompt: z.string().trim().min(1).max(4000),
  enhance: z.boolean().default(true),
  // The picture the clip starts from.
  referenceFileIDs: z.array(z.string().min(1).max(40)).max(1).default([]),
  // The picture the clip ends on; only with a first frame.
  lastFrameFileID: z.string().min(1).max(40).optional(),
  // Saved characters in the clip and the location it is set in, whose photos the model gets as
  // references. OpenRouter drops references sent next to frames, so a clip takes one or the other.
  characterIDs: z.array(z.string().min(1).max(40)).max(MAX_CHARACTERS_PER_RUN).default([]),
  locationID: z.string().min(1).max(40).optional(),
  projectID: z.string().min(1).max(40).optional(),
})

// Everything before a video job is submitted: paid plans only, the price, the frames or the cast, the
// screening and rewrite, the credit hold and the row. Nothing is charged before every check passed.
// What the job is sent is read back from the row when it is submitted (see startVideo).
export async function prepareVideo(input: {
  db: Database
  bucket: R2Bucket
  images?: ImagesBinding
  apiKey: string
  baseURL?: string
  user: User
  request: z.infer<typeof CreateVideo>
}) {
  const db = input.db
  const body = input.request
  const plan = await loadPlan(db, input.user)
  if (plan.parallel_limit === 0) {
    throw new ApiError(403, "VIDEO_REQUIRES_PAID", "Tạo video dành cho gói trả phí. Hãy nâng cấp gói.")
  }
  const project = body.projectID ? await ownProject(db, input.user.id, body.projectID) : undefined
  const models = await loadVideoModels(db)
  const model = models.find((m) => m.id === body.model)!
  if (!model.aspectRatios.includes(body.aspectRatio)) {
    throw new ApiError(400, "INVALID_ASPECT", "Tỷ lệ khung không hợp lệ")
  }
  const cost = videoCreditCost(models, {
    model: body.model,
    option: body.option,
    duration: body.duration,
    firstFrame: body.referenceFileIDs.length > 0,
  })
  if (cost === undefined) throw new ApiError(400, "INVALID_OPTION", "Tuỳ chọn video không hợp lệ")
  const lastID = body.lastFrameFileID
  if (lastID && body.referenceFileIDs.length === 0) {
    throw new ApiError(400, "LAST_FRAME_NEEDS_FIRST", "Hãy thêm khung hình đầu trước khung hình cuối")
  }
  if (lastID && !model.lastFrame) throw new ApiError(400, "INVALID_OPTION", "Model này không nhận khung hình cuối")
  if ((body.characterIDs.length || body.locationID) && (body.referenceFileIDs.length || lastID)) {
    throw new ApiError(
      400,
      "FRAMES_OR_CAST",
      "Video dùng khung hình hoặc nhân vật và bối cảnh, không dùng cùng lúc. Hãy bỏ một trong hai.",
    )
  }
  const cast = await ownCharacters(db, input.user.id, [...new Set(body.characterIDs)])
  const place = body.locationID ? await ownLocation(db, input.user.id, body.locationID) : undefined

  await reapStaleGenerations(db)
  const running = await db
    .select({ count: sql<number>`count(*)` })
    .from(generations)
    .where(and(eq(generations.user_id, input.user.id), eq(generations.status, "running")))
    .get()
  if ((running?.count ?? 0) >= plan.parallel_limit) {
    throw new ApiError(429, "PARALLEL_LIMIT", `Gói của bạn chạy tối đa ${plan.parallel_limit} lượt tạo cùng lúc`, {
      limit: plan.parallel_limit,
    })
  }

  // The screening and rewrite look at small copies of the frames, both or none, so their numbers stay
  // right. It is told the cast by name only, the way a picture's rewrite is.
  const fileID = body.referenceFileIDs[0]
  const first = await ownPicture(db, input.user.id, fileID)
  const last = await ownPicture(db, input.user.id, lastID)
  const images = input.images
  const frames = [first, last].flatMap((row) => (row ? [row] : []))
  const chosen = savedPhotos(cast, place, MAX_VIDEO_REFERENCES)
  const glanced = images
    ? await Promise.all(frames.map((row) => glance(images, input.bucket, row.r2_key).catch(() => undefined)))
    : []
  const pictures = glanced.filter((url): url is string => url !== undefined)

  const enhanced = await enhancePrompt({
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    model: body.model,
    clip: { seconds: body.duration, sound: model.sound, lastFrame: last !== undefined },
    prompt: body.prompt,
    rewrite: body.enhance,
    aspectRatio: body.aspectRatio,
    references: frames.length,
    cast: cast.map((character, index) => ({ name: character.name, images: chosen.photos[index]?.length ?? 0 })),
    place: place ? { name: place.name, images: chosen.placePhotos.length } : undefined,
    pictures: pictures.length === frames.length ? pictures : [],
    languageModel: (await languageModels(db, input.user.id)).rewrite,
  })
  if (enhanced.unavailable) throw new ApiError(502, "SCREENING_UNAVAILABLE", enhanced.reason ?? "Hãy thử lại sau")
  if (!enhanced.allowed) throw new ApiError(422, "PROMPT_BLOCKED", enhanced.reason ?? "Nội dung không được phép")

  const id = ulid()
  await reserve(db, {
    userID: input.user.id,
    amount: cost,
    generationID: id,
    reason: `${model.name} ${body.option} ${body.duration}s`,
  })
  const now = Date.now()
  await db.insert(generations).values({
    id,
    user_id: input.user.id,
    kind: "video",
    status: "running",
    model: body.model,
    option: body.option,
    aspect_ratio: body.aspectRatio,
    n: 1,
    duration: body.duration,
    prompt_raw: body.prompt,
    prompt_enhanced: enhanced.rewritten ? enhanced.prompt : null,
    enhance: body.enhance ? 1 : 0,
    cost_usd: enhanced.costUsd,
    reference_file_ids: JSON.stringify(fileID ? [fileID] : []),
    last_frame_file_id: lastID ?? null,
    character_ids: JSON.stringify(cast.map((character) => character.id)),
    location_id: place?.id ?? null,
    credits_reserved: cost,
    project_id: project?.id ?? null,
    created_at: now,
  })
  if (project) await touchProject(db, project, body.prompt, now)
  const generation = (await db.select().from(generations).where(eq(generations.id, id)).get())!
  return { generation, model }
}

// A picture of the person's own by its file id, or none for no id: a file of someone else's, or one
// that is not a picture (a clip), is not found.
async function ownPicture(db: Database, userID: string, fileID: string | undefined) {
  if (!fileID) return undefined
  const row = await db
    .select({ r2_key: files.r2_key, mime: files.mime })
    .from(files)
    .where(and(eq(files.id, fileID), eq(files.user_id, userID)))
    .get()
  if (!row || !IMAGE_MIMES.has(row.mime)) throw new ApiError(404, "FILE_NOT_FOUND", "Ảnh tham chiếu không tồn tại")
  return row
}
