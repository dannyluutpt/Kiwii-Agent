import { and, desc, eq, inArray, lt, sql } from "drizzle-orm"
import type { Context } from "hono"
import { streamSSE } from "hono/streaming"
import { ulid } from "ulid"
import { z } from "zod"
import { ApiError, createApp, type AppEnv } from "../app"
import { loadPlan } from "../chat/quota"
import { balance, reserve } from "../credits/ledger"
import { TRIAL_MODELS } from "../credits/trial"
import { files, generation_images, generations } from "../db/schema"
import { enhancePrompt } from "../images/enhance"
import { friendly, reapStaleGenerations, runGeneration, type GenerationEvent } from "../images/generate"
import {
  imageCreditCost,
  ImageModelID,
  loadImageModels,
  MAX_IMAGES_PER_RUN,
  REFERENCE_SURCHARGE,
} from "../images/models"
import type { ImageReference } from "../images/openrouter-images"
import { IMAGE_MIMES, MAX_UPLOAD_BYTES, objectKey, putObject, toDataURL } from "../images/r2"
import { requireAuth } from "../middleware/auth"

const MAX_REFERENCES = 4

const CreateGeneration = z.object({
  model: z.enum(ImageModelID),
  option: z.string().min(1).max(10),
  aspectRatio: z.string().regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/),
  n: z.number().int().min(1).max(MAX_IMAGES_PER_RUN).default(1),
  prompt: z.string().trim().min(1).max(4000),
  enhance: z.boolean().default(true),
  referenceFileIDs: z.array(z.string().min(1).max(40)).max(MAX_REFERENCES).default([]),
})

const ListQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(60).default(24),
})

export const images = createApp()

images.use("*", requireAuth)

images.get("/models", async (c) => {
  const db = c.get("db")
  const user = c.get("user")
  const plan = await loadPlan(db, user)
  const credits = await balance(db, user.id)
  const access = imageAccess(plan.parallel_limit, credits)
  const models = (await loadImageModels(db)).filter(
    (model) => access.models === null || access.models.includes(model.id),
  )
  return c.json({
    canGenerate: access.parallelLimit > 0,
    trial: access.trial,
    parallelLimit: access.parallelLimit,
    maxImages: MAX_IMAGES_PER_RUN,
    maxReferences: MAX_REFERENCES,
    referenceSurcharge: REFERENCE_SURCHARGE,
    credits,
    models: models.map((model) => ({
      id: model.id,
      name: model.name,
      tagline: user.locale === "en" ? model.tagline_en : model.tagline_vi,
      param: model.param,
      options: model.options
        .filter((option) => option.credits !== null)
        .map((option) => ({
          id: option.id,
          label: user.locale === "en" ? option.label_en : option.label_vi,
          credits: option.credits,
        })),
      aspectRatios: model.aspectRatios,
      maxReferences: Math.min(model.maxReferences, MAX_REFERENCES),
      maxReferenceEdge: model.maxReferenceEdge,
    })),
  })
})

images.post("/references", async (c) => {
  const user = c.get("user")
  const form = await c.req.formData().catch(() => undefined)
  const file = form?.get("file") as unknown as File | string | null | undefined
  if (!file || typeof file === "string") throw new ApiError(400, "INVALID_INPUT", "Thiếu tệp ảnh")
  if (!IMAGE_MIMES.has(file.type)) throw new ApiError(400, "UNSUPPORTED_TYPE", "Chỉ nhận ảnh JPEG, PNG hoặc WebP")
  if (file.size > MAX_UPLOAD_BYTES) throw new ApiError(400, "FILE_TOO_LARGE", "Ảnh tối đa 10 MB")
  const key = objectKey(user.id, file.type)
  await putObject(c.env.BUCKET, key, await file.arrayBuffer(), file.type)
  const id = ulid()
  await c
    .get("db")
    .insert(files)
    .values({
      id,
      user_id: user.id,
      r2_key: key,
      name: file.name.slice(0, 120) || "reference",
      mime: file.type,
      size: file.size,
      kind: "reference",
    })
  return c.json({ id, url: fileURL(id), name: file.name, size: file.size })
})

images.get("/files/:id", async (c) => {
  const row = await ownFile(c, c.req.param("id"))
  const object = await c.env.BUCKET.get(row.r2_key)
  if (!object) throw new ApiError(404, "FILE_NOT_FOUND", "Không tìm thấy tệp")
  const headers = new Headers()
  object.writeHttpMetadata(headers)
  headers.set("content-type", row.mime)
  headers.set("etag", object.httpEtag)
  headers.set("cache-control", "private, max-age=31536000, immutable")
  if (c.req.query("download") !== undefined) headers.set("content-disposition", `attachment; filename="${row.name}"`)
  return new Response(object.body, { headers })
})

images.post("/generations", async (c) => {
  const body = CreateGeneration.parse(await c.req.json())
  const db = c.get("db")
  const user = c.get("user")
  const apiKey = c.env.OPENROUTER_API_KEY
  if (!apiKey) throw new ApiError(500, "LLM_NOT_CONFIGURED", "Thiếu OPENROUTER_API_KEY")

  const plan = await loadPlan(db, user)
  const access = imageAccess(plan.parallel_limit, await balance(db, user.id))
  if (access.parallelLimit === 0) {
    throw new ApiError(403, "IMAGE_REQUIRES_PAID", "Tạo ảnh dành cho gói trả phí. Hãy nâng cấp gói.")
  }
  if (access.models && !access.models.includes(body.model)) {
    throw new ApiError(403, "IMAGE_REQUIRES_PAID", "Credit dùng thử chỉ dùng được với FLUX 3 Klein. Hãy nâng cấp gói.")
  }
  const models = await loadImageModels(db)
  const model = models.find((m) => m.id === body.model)!
  const option = model.options.find((o) => o.id === body.option)
  if (!option || option.credits === null) throw new ApiError(400, "INVALID_OPTION", "Tuỳ chọn chất lượng không hợp lệ")
  const perImageCredits = option.credits
  if (!model.aspectRatios.includes(body.aspectRatio))
    throw new ApiError(400, "INVALID_ASPECT", "Tỷ lệ khung không hợp lệ")
  const referenceIDs = [...new Set(body.referenceFileIDs)].slice(0, Math.min(model.maxReferences, MAX_REFERENCES))
  const cost = imageCreditCost(models, {
    model: body.model,
    option: body.option,
    n: body.n,
    references: referenceIDs.length,
  })
  if (cost === undefined) throw new ApiError(400, "INVALID_INPUT", "Yêu cầu không hợp lệ")

  await reapStaleGenerations(db)
  const running = await db
    .select({ count: sql<number>`count(*)` })
    .from(generations)
    .where(and(eq(generations.user_id, user.id), eq(generations.status, "running")))
    .get()
  if ((running?.count ?? 0) >= access.parallelLimit) {
    throw new ApiError(429, "PARALLEL_LIMIT", `Gói của bạn chạy tối đa ${access.parallelLimit} lượt tạo ảnh cùng lúc`, {
      limit: access.parallelLimit,
    })
  }

  const references: ImageReference[] = []
  if (referenceIDs.length > 0) {
    const rows = await db
      .select({ id: files.id, r2_key: files.r2_key })
      .from(files)
      .where(and(eq(files.user_id, user.id), inArray(files.id, referenceIDs)))
    if (rows.length !== referenceIDs.length) throw new ApiError(404, "FILE_NOT_FOUND", "Ảnh tham chiếu không tồn tại")
    for (const row of rows) {
      const url = await toDataURL(c.env.BUCKET, row.r2_key)
      if (!url) throw new ApiError(404, "FILE_NOT_FOUND", "Ảnh tham chiếu không tồn tại")
      references.push({ type: "image_url", image_url: { url } })
    }
  }

  // Moderation runs before any credit moves so a blocked prompt costs nothing.
  const enhanced = await enhancePrompt({
    apiKey,
    baseURL: c.env.OPENROUTER_BASE_URL,
    model: body.model,
    prompt: body.prompt,
    rewrite: body.enhance,
    references: references.length,
  })
  if (!enhanced.allowed) throw new ApiError(422, "PROMPT_BLOCKED", enhanced.reason ?? "Nội dung không được phép")

  const id = ulid()
  await reserve(db, {
    userID: user.id,
    amount: cost,
    generationID: id,
    reason: `${model.name} ${option.id} ×${body.n}`,
  })
  const now = Date.now()
  await db.insert(generations).values({
    id,
    user_id: user.id,
    status: "running",
    model: body.model,
    option: body.option,
    aspect_ratio: body.aspectRatio,
    n: body.n,
    prompt_raw: body.prompt,
    prompt_enhanced: enhanced.rewritten ? enhanced.prompt : null,
    enhance: body.enhance ? 1 : 0,
    reference_file_ids: JSON.stringify(referenceIDs),
    credits_reserved: cost,
    created_at: now,
  })
  const generation = (await db.select().from(generations).where(eq(generations.id, id)).get())!

  return streamSSE(c, async (stream) => {
    let closed = false
    stream.onAbort(() => {
      closed = true
    })
    const emit = async (event: GenerationEvent) => {
      if (closed) return
      await stream.writeSSE({ event: event.type, data: JSON.stringify(event) }).catch(() => {
        closed = true
      })
    }
    await emit({ type: "start", ...presentGeneration(generation, []) } as never)
    const job = runGeneration({
      db,
      bucket: c.env.BUCKET,
      apiKey,
      baseURL: c.env.OPENROUTER_BASE_URL,
      generation,
      model,
      perImageCredits,
      references,
      emit,
    })
    // Keeps the settle/refund alive for a short while if the browser leaves mid-generation.
    c.executionCtx.waitUntil(job)
    await job
  })
})

images.get("/generations", async (c) => {
  const query = ListQuery.parse(c.req.query())
  const db = c.get("db")
  const user = c.get("user")
  await reapStaleGenerations(db)
  const rows = await db
    .select()
    .from(generations)
    .where(and(eq(generations.user_id, user.id), query.cursor ? lt(generations.id, query.cursor) : undefined))
    .orderBy(desc(generations.id))
    .limit(query.limit + 1)
  const page = rows.slice(0, query.limit)
  const imageRows = page.length
    ? await db
        .select()
        .from(generation_images)
        .where(
          inArray(
            generation_images.generation_id,
            page.map((g) => g.id),
          ),
        )
        .orderBy(generation_images.position)
    : []
  return c.json({
    generations: page.map((g) =>
      presentGeneration(
        g,
        imageRows.filter((i) => i.generation_id === g.id),
      ),
    ),
    nextCursor: rows.length > query.limit ? page.at(-1)?.id : null,
  })
})

images.get("/generations/:id", async (c) => {
  const generation = await ownGeneration(c, c.req.param("id"))
  const imageRows = await db(c)
    .select()
    .from(generation_images)
    .where(eq(generation_images.generation_id, generation.id))
    .orderBy(generation_images.position)
  return c.json(presentGeneration(generation, imageRows))
})

images.delete("/generations/:id", async (c) => {
  const generation = await ownGeneration(c, c.req.param("id"))
  if (generation.status === "running") throw new ApiError(409, "GENERATION_RUNNING", "Lượt tạo đang chạy")
  const owned = await db(c)
    .select({ id: files.id, r2_key: files.r2_key })
    .from(files)
    .where(eq(files.generation_id, generation.id))
  if (owned.length) await c.env.BUCKET.delete(owned.map((f) => f.r2_key))
  await db(c).batch([
    db(c).delete(generation_images).where(eq(generation_images.generation_id, generation.id)),
    db(c).delete(files).where(eq(files.generation_id, generation.id)),
    db(c).delete(generations).where(eq(generations.id, generation.id)),
  ])
  return c.json({ ok: true })
})

images.get("/assets", async (c) => {
  const query = ListQuery.parse(c.req.query())
  const user = c.get("user")
  const rows = await db(c)
    .select({
      id: generation_images.id,
      fileID: generation_images.file_id,
      generationID: generation_images.generation_id,
      createdAt: generation_images.created_at,
      model: generations.model,
      option: generations.option,
      aspectRatio: generations.aspect_ratio,
      prompt: generations.prompt_raw,
    })
    .from(generation_images)
    .innerJoin(generations, eq(generations.id, generation_images.generation_id))
    .where(
      and(eq(generation_images.user_id, user.id), query.cursor ? lt(generation_images.id, query.cursor) : undefined),
    )
    .orderBy(desc(generation_images.id))
    .limit(query.limit + 1)
  const page = rows.slice(0, query.limit)
  return c.json({
    assets: page.map((row) => ({ ...row, url: fileURL(row.fileID) })),
    nextCursor: rows.length > query.limit ? page.at(-1)?.id : null,
  })
})

type Ctx = Context<AppEnv>

// Paid plans use their plan limit and every model. A free account with leftover trial (or
// top-up) credits may run one generation at a time on the trial models only.
export function imageAccess(parallelLimit: number, credits: number) {
  if (parallelLimit > 0) return { parallelLimit, models: null as readonly string[] | null, trial: false }
  if (credits > 0) return { parallelLimit: 1, models: TRIAL_MODELS as readonly string[], trial: true }
  return { parallelLimit: 0, models: TRIAL_MODELS as readonly string[], trial: false }
}

const db = (c: Ctx) => c.get("db")

export function fileURL(id: string) {
  return `/api/images/files/${id}`
}

// What the browser sees of a run. The rewritten prompt is internal and never leaves the server.
function presentGeneration(
  g: typeof generations.$inferSelect,
  imageRows: Array<typeof generation_images.$inferSelect>,
) {
  return {
    id: g.id,
    status: g.status,
    model: g.model,
    option: g.option,
    aspectRatio: g.aspect_ratio,
    n: g.n,
    prompt: g.prompt_raw,
    enhance: g.enhance === 1,
    referenceFileIDs: JSON.parse(g.reference_file_ids) as string[],
    creditsReserved: g.credits_reserved,
    creditsFinal: g.credits_final,
    error: g.error === null ? null : friendly(g.error),
    createdAt: g.created_at,
    finishedAt: g.finished_at,
    images: imageRows.map((row) => ({
      id: row.id,
      fileID: row.file_id,
      position: row.position,
      url: fileURL(row.file_id),
    })),
  }
}

async function ownGeneration(c: Ctx, id: string) {
  const row = await db(c)
    .select()
    .from(generations)
    .where(and(eq(generations.id, id), eq(generations.user_id, c.get("user").id)))
    .get()
  if (!row) throw new ApiError(404, "GENERATION_NOT_FOUND", "Không tìm thấy lượt tạo")
  return row
}

async function ownFile(c: Ctx, id: string) {
  const row = await db(c)
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.user_id, c.get("user").id)))
    .get()
  if (!row) throw new ApiError(404, "FILE_NOT_FOUND", "Không tìm thấy tệp")
  return row
}
