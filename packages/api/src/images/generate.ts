import { and, eq, lt, or } from "drizzle-orm"
import { ulid } from "ulid"
import { BRAND_SLUG } from "../brand"
import { refund, settle } from "../credits/ledger"
import type { Database } from "../db/client"
import { files, generation_images, generations } from "../db/schema"
import type { ImageModel } from "./models"
import {
  generateImages,
  ImageProviderError,
  streamImages,
  type GeneratedImage,
  type ImageReference,
} from "./openrouter-images"
import { objectKey, putObject } from "./r2"

export type GenerationEvent =
  | { type: "partial"; index: number; b64: string }
  | { type: "image"; index: number; id: string; fileID: string }
  | { type: "done"; creditsFinal: number; refunded: number }
  | { type: "error"; message: string; refunded: number }

export type Generation = typeof generations.$inferSelect

// A generation older than this and still "running" lost its Worker (client went away for longer
// than waitUntil allows); OpenRouter never bills an unfinished image so the credits go back.
export const STALE_AFTER_MS = 10 * 60 * 1000
// A video's workflow gives up after half an hour; the reaper only catches one that died.
export const STALE_VIDEO_AFTER_MS = 60 * 60 * 1000

type RunInput = {
  db: Database
  bucket: R2Bucket
  apiKey: string
  baseURL?: string
  generation: Generation
  model: ImageModel
  perImageCredits: number
  references: ImageReference[]
  // Which reference images show which character (see castLegend); it opens the prompt.
  legend?: string
  emit: (event: GenerationEvent) => Promise<void> | void
  signal?: AbortSignal
}

export async function runGeneration(input: RunInput) {
  const { db, generation, model } = input
  const prompt = [input.legend, generation.prompt_enhanced ?? generation.prompt_raw].filter(Boolean).join("\n\n")
  const base = {
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    slug: model.slug,
    prompt,
    aspectRatio: generation.aspect_ratio,
    resolution: model.param === "resolution" ? generation.option : undefined,
    quality: model.param === "quality" ? generation.option : undefined,
    references: input.references,
    signal: input.signal,
  }
  let stored = 0
  let next = 0
  // Starts from the prompt screening and rewrite, recorded when the generation was created.
  let cost = generation.cost_usd ?? 0
  let lastError: string | undefined

  const store = async (image: GeneratedImage) => {
    const position = next++
    const key = objectKey(generation.user_id, image.mime)
    await putObject(input.bucket, key, image.bytes, image.mime)
    const fileID = ulid()
    const imageID = ulid()
    await db.insert(files).values({
      id: fileID,
      user_id: generation.user_id,
      r2_key: key,
      name: `${BRAND_SLUG}-${generation.id}-${position + 1}.${key.split(".").pop()}`,
      mime: image.mime,
      size: image.bytes.byteLength,
      kind: "image",
      generation_id: generation.id,
    })
    await db.insert(generation_images).values({
      id: imageID,
      generation_id: generation.id,
      user_id: generation.user_id,
      file_id: fileID,
      position,
    })
    stored++
    await input.emit({ type: "image", index: position, id: imageID, fileID })
  }

  try {
    if (model.multiImage) {
      // Previews stream for one fresh picture only: OpenRouter refuses stream=true for an edit
      // ("Streaming is not supported for image-to-image (edit) requests") and for several pictures
      // at once ("Streaming is not supported with n > 1").
      if (model.streaming && input.references.length === 0 && generation.n === 1) {
        for await (const event of streamImages({ ...base, n: generation.n })) {
          if (event.type === "partial") await input.emit(event)
          if (event.type === "error") throw event.error
          if (event.type === "completed") {
            cost += event.result.costUsd
            for (const image of event.result.images) await store(image)
          }
        }
      } else {
        const result = await generateImages({ ...base, n: generation.n })
        cost += result.costUsd
        for (const image of result.images) await store(image)
      }
    } else {
      // Single-image providers: one request per image, in parallel, each stored as it lands.
      const results = await Promise.allSettled(
        Array.from({ length: generation.n }, () =>
          generateImages({ ...base, n: 1 }).then(async (result) => {
            cost += result.costUsd
            for (const image of result.images) await store(image)
          }),
        ),
      )
      for (const result of results) {
        if (result.status === "rejected") lastError = describe(result.reason)
      }
    }
  } catch (error) {
    lastError = describe(error)
  }

  const now = Date.now()
  if (stored === 0) {
    const refunded = await refund(db, {
      userID: generation.user_id,
      generationID: generation.id,
      reason: "generation failed",
    })
    await db
      .update(generations)
      .set({
        status: "failed",
        error: lastError ?? "Không tạo được ảnh",
        credits_final: 0,
        cost_usd: cost,
        finished_at: now,
      })
      .where(eq(generations.id, generation.id))
    await input.emit({ type: "error", message: friendly(lastError), refunded })
    return
  }
  const missing = generation.n - stored
  const refunded =
    missing > 0
      ? await refund(db, {
          userID: generation.user_id,
          generationID: generation.id,
          reason: `${missing} of ${generation.n} images failed`,
          amount: missing * input.perImageCredits,
        })
      : 0
  await settle(db, { userID: generation.user_id, generationID: generation.id, costUsd: cost })
  const creditsFinal = generation.credits_reserved - refunded
  await db
    .update(generations)
    .set({ status: "done", credits_final: creditsFinal, cost_usd: cost, error: lastError ?? null, finished_at: now })
    .where(eq(generations.id, generation.id))
  await input.emit({ type: "done", creditsFinal, refunded })
}

function describe(error: unknown) {
  if (error instanceof ImageProviderError) return `${error.status}: ${error.message}`
  if (error instanceof Error) return error.message
  return String(error)
}

// What the customer reads about a failure; the raw provider error stays in the database.
export function friendly(error: string | undefined, what: "ảnh" | "video" = "ảnh") {
  if (!error) return `Không tạo được ${what}, credit đã được hoàn`
  if (error.startsWith("429")) return "Model đang quá tải, thử lại sau ít phút. Credit đã được hoàn"
  if (/megapixel|dimensions exceed/i.test(error))
    return "Ảnh tham chiếu quá lớn, hãy dùng ảnh nhỏ hơn. Credit đã được hoàn"
  if (/data policy|ZDR|privacy/i.test(error))
    return "Model này tạm thời chưa dùng được, hãy chọn model khác. Credit đã được hoàn"
  if (/moderation|safety|policy|content/i.test(error)) return "Nội dung bị model từ chối. Credit đã được hoàn"
  if (error === "timeout") return `Tạo ${what} quá lâu nên đã dừng. Credit đã được hoàn`
  return `Không tạo được ${what}, credit đã được hoàn`
}

// Fails and refunds generations stuck in "running". Called from the daily cron and before listing.
export async function reapStaleGenerations(db: Database, now = Date.now()) {
  const rows = await db
    .select({ id: generations.id, user_id: generations.user_id })
    .from(generations)
    .where(
      and(
        eq(generations.status, "running"),
        or(
          and(eq(generations.kind, "image"), lt(generations.created_at, now - STALE_AFTER_MS)),
          lt(generations.created_at, now - STALE_VIDEO_AFTER_MS),
        ),
      ),
    )
  for (const row of rows) {
    const claimed = await db
      .update(generations)
      .set({ status: "failed", error: "timeout", credits_final: 0, finished_at: now })
      .where(and(eq(generations.id, row.id), eq(generations.status, "running")))
      .returning({ id: generations.id })
    if (claimed.length === 0) continue
    await refund(db, { userID: row.user_id, generationID: row.id, reason: "generation timed out" })
  }
  return rows.length
}
