import { and, desc, eq, inArray, lt } from "drizzle-orm"
import type { Context } from "hono"
import { streamSSE } from "hono/streaming"
import { ulid } from "ulid"
import { z } from "zod"
import { ApiError, createApp, type AppEnv } from "../app"
import { MAX_CHARACTERS_PER_RUN } from "../characters/store"
import { loadPlan } from "../plans"
import { balance } from "../credits/ledger"
import { files, generation_images, generations } from "../db/schema"
import { reapStaleGenerations, runGeneration, type GenerationEvent } from "../images/generate"
import { loadImageModels, MAX_IMAGES_PER_RUN, MAX_REFERENCES } from "../images/models"
import { CreateGeneration, imageAccess, prepareGeneration } from "../images/prepare"
import { fileURL, presentGeneration } from "../images/present"
import { IMAGE_MIMES, MAX_UPLOAD_BYTES, objectKey, putObject } from "../images/r2"
import { requireAuth } from "../middleware/auth"

const ListQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(60).default(24),
})

// One project's runs, or every run when absent.
const GenerationsQuery = ListQuery.extend({ project: z.string().min(1).max(40).optional() })

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
    maxCharacters: MAX_CHARACTERS_PER_RUN,
    credits,
    models: models.map((model) => ({
      id: model.id,
      name: model.name,
      tagline: user.locale === "en" ? model.tagline_en : model.tagline_vi,
      param: model.param,
      options: model.options
        .filter((option) => option.credits !== null && (access.options?.includes(option.id) ?? true))
        .map((option) => ({
          id: option.id,
          label: user.locale === "en" ? option.label_en : option.label_vi,
          credits: option.credits,
        })),
      aspectRatios: model.aspectRatios,
      maxReferences: Math.min(model.maxReferences, MAX_REFERENCES),
      maxReferenceEdge: model.maxReferenceEdge,
      referenceSurcharge: model.referenceSurcharge,
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
  const request = CreateGeneration.parse(await c.req.json())
  const db = c.get("db")
  const apiKey = c.env.OPENROUTER_API_KEY
  if (!apiKey) throw new ApiError(500, "LLM_NOT_CONFIGURED", "Thiếu OPENROUTER_API_KEY")
  const prepared = await prepareGeneration({
    db,
    bucket: c.env.BUCKET,
    apiKey,
    baseURL: c.env.OPENROUTER_BASE_URL,
    user: c.get("user"),
    request,
  })

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
    await emit({ type: "start", ...presentGeneration(prepared.generation, []) } as never)
    const job = runGeneration({
      ...prepared,
      db,
      bucket: c.env.BUCKET,
      apiKey,
      baseURL: c.env.OPENROUTER_BASE_URL,
      emit,
    })
    // Keeps the settle/refund alive for a short while if the browser leaves mid-generation.
    c.executionCtx.waitUntil(job)
    await job
  })
})

images.get("/generations", async (c) => {
  const query = GenerationsQuery.parse(c.req.query())
  const db = c.get("db")
  const user = c.get("user")
  await reapStaleGenerations(db)
  const rows = await db
    .select()
    .from(generations)
    .where(
      and(
        eq(generations.user_id, user.id),
        query.project ? eq(generations.project_id, query.project) : undefined,
        query.cursor ? lt(generations.id, query.cursor) : undefined,
      ),
    )
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

const db = (c: Ctx) => c.get("db")

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
