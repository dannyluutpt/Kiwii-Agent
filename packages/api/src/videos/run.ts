import { and, eq, inArray } from "drizzle-orm"
import { ApiError } from "../app"
import { BRAND_SLUG } from "../brand"
import { ownCharacters } from "../characters/store"
import { refund, settle } from "../credits/ledger"
import type { Database } from "../db/client"
import { files, generation_images, generations } from "../db/schema"
import { castLegend } from "../images/enhance"
import { friendly } from "../images/generate"
import { framed, glance } from "../images/glance"
import { savedPhotos } from "../images/prepare"
import { objectKey, putObject, toDataURL } from "../images/r2"
import { ownLocation } from "../locations/store"
import { MAX_VIDEO_REFERENCES, type VideoModel } from "./models"
import { downloadVideo, submitVideo, VideoProviderError, videoJob } from "./openrouter-videos"

type Generation = typeof generations.$inferSelect
type Connection = { apiKey: string; baseURL?: string }

// What a video workflow instance is created with.
export type VideoParams = { generationID: string }

// Job states that will never bring a clip.
const ENDED = ["failed", "cancelled", "expired"]

// What a clip's job gets besides its prompt and settings, read from its run when it is submitted:
// the frames it starts from and ends on, or the photos of its characters and location with the note
// that names them. A clip waiting for a free slot is submitted long after it was prepared, so nothing
// here may come from the request that made it.
async function videoInputs(input: {
  db: Database
  bucket: R2Bucket
  images?: ImagesBinding
  generation: Generation
  model: VideoModel
}) {
  const g = input.generation
  const images = input.images
  const firstID = (JSON.parse(g.reference_file_ids) as string[])[0]
  const lastID = g.last_frame_file_id ?? undefined
  const cast = await ownCharacters(input.db, g.user_id, JSON.parse(g.character_ids) as string[])
  const place = g.location_id ? await ownLocation(input.db, g.user_id, g.location_id) : undefined
  const chosen = savedPhotos(cast, place, MAX_VIDEO_REFERENCES)
  const photos = [...chosen.photos.flat(), ...chosen.placePhotos]
  const wanted = [firstID, lastID, ...photos].filter((id): id is string => id !== undefined)
  const rows = wanted.length
    ? await input.db
        .select({ id: files.id, r2_key: files.r2_key })
        .from(files)
        .where(and(eq(files.user_id, g.user_id), inArray(files.id, wanted)))
    : []
  // Each picture at most the model's edge on its long side (its videos are no larger). A clip that
  // ends on a picture gets both frames cut to its own shape, so the two match.
  const scaled = (key: string, cut: boolean) => {
    if (!images) return toDataURL(input.bucket, key)
    const edge = input.model.maxReferenceEdge
    const copy = cut ? framed(images, input.bucket, key, g.aspect_ratio, edge) : glance(images, input.bucket, key, edge)
    return copy.catch(() => toDataURL(input.bucket, key))
  }
  const picture = async (fileID: string, cut: boolean) => {
    const key = rows.find((row) => row.id === fileID)?.r2_key
    const url = key ? await scaled(key, cut) : undefined
    if (!url) throw new Error(`picture ${fileID} is gone`)
    return url
  }
  return {
    firstFrame: firstID ? await picture(firstID, lastID !== undefined) : undefined,
    lastFrame: lastID ? await picture(lastID, true) : undefined,
    references: await Promise.all(photos.map((fileID) => picture(fileID, false))),
    legend: castLegend(
      cast.map((character, index) => ({ name: character.name, images: chosen.photos[index]?.length ?? 0 })),
      0,
      place ? { name: place.name, images: chosen.placePhotos.length } : undefined,
    ),
  }
}

// Submits the run's job and hands the wait to the workflow. A refused job fails the run, refunded,
// before the person leaves the page.
export async function startVideo(
  input: Connection & {
    db: Database
    bucket: R2Bucket
    images?: ImagesBinding
    generation: Generation
    model: VideoModel
    workflow?: Workflow<VideoParams>
  },
) {
  const g = input.generation
  const sent = await videoInputs(input).catch((error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  )
  if (sent instanceof Error) {
    await failVideo(input.db, g, sent.message)
    if (sent instanceof ApiError) throw sent
    throw new ApiError(502, "VIDEO_FAILED", friendly(sent.message, "video"))
  }
  const jobID = await submitVideo({
    apiKey: input.apiKey,
    baseURL: input.baseURL,
    slug: input.model.slug,
    // The note naming the characters' and the location's photos leads, as it does for a picture.
    prompt: [sent.legend, g.prompt_enhanced ?? g.prompt_raw].filter(Boolean).join("\n\n"),
    duration: g.duration ?? 0,
    resolution: g.option,
    aspectRatio: g.aspect_ratio,
    sound: input.model.sound,
    firstFrame: sent.firstFrame,
    lastFrame: sent.lastFrame,
    references: sent.references,
  }).catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))))
  if (jobID instanceof Error) {
    await failVideo(input.db, g, describe(jobID))
    throw new ApiError(502, "VIDEO_FAILED", friendly(describe(jobID), "video"))
  }
  await input.db.update(generations).set({ job_id: jobID }).where(eq(generations.id, g.id))
  if (!input.workflow) console.warn(`[video] no workflow binding; ${g.id} waits for the reaper`)
  // Nobody would look at the job without its workflow: the run fails now rather than in an hour.
  const watched = await input.workflow
    ?.create({ id: g.id, params: { generationID: g.id } })
    .catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))))
  if (watched instanceof Error) {
    console.error(`[video] workflow for ${g.id} not created: ${watched.message}`)
    await failVideo(input.db, g, `workflow: ${watched.message}`)
    throw new ApiError(502, "VIDEO_FAILED", friendly(watched.message, "video"))
  }
  return { ...g, job_id: jobID }
}

// One look at a running video's job: stores the clip and settles the run when the job is done,
// fails and refunds it when the job failed. "running" means look again later.
export async function checkVideo(input: Connection & { db: Database; bucket: R2Bucket; generationID: string }) {
  const db = input.db
  const g = await db.select().from(generations).where(eq(generations.id, input.generationID)).get()
  if (!g || g.status !== "running" || !g.job_id) return g?.status ?? "failed"
  const job = await videoJob({ apiKey: input.apiKey, baseURL: input.baseURL, jobID: g.job_id })
  if (ENDED.includes(job.status)) {
    await failVideo(db, g, job.error ?? job.status, job.costUsd)
    return "failed"
  }
  // pending, in_progress, or a state OpenRouter adds later: the workflow looks again.
  if (job.status !== "completed") return "running"

  // The clip, its file and its place in the run all take the run's id, so a look the workflow
  // retries halfway through overwrites what the failed one left instead of adding a second clip.
  const bytes = await downloadVideo({ apiKey: input.apiKey, baseURL: input.baseURL, jobID: g.job_id })
  const key = objectKey(g.user_id, "video/mp4", g.id)
  await putObject(input.bucket, key, bytes, "video/mp4")
  const fileID = g.id
  await db
    .insert(files)
    .values({
      id: fileID,
      user_id: g.user_id,
      r2_key: key,
      name: `${BRAND_SLUG}-${g.id}.mp4`,
      mime: "video/mp4",
      size: bytes.byteLength,
      kind: "video",
      generation_id: g.id,
    })
    .onConflictDoNothing()
  await db
    .insert(generation_images)
    .values({ id: g.id, generation_id: g.id, user_id: g.user_id, file_id: fileID, position: 0 })
    .onConflictDoNothing()
  const costUsd = (g.cost_usd ?? 0) + job.costUsd
  const claimed = await db
    .update(generations)
    .set({ status: "done", credits_final: g.credits_reserved, cost_usd: costUsd, error: null, finished_at: Date.now() })
    .where(and(eq(generations.id, g.id), eq(generations.status, "running")))
    .returning({ id: generations.id })
  // The reaper got there first and refunded the run: the clip goes too.
  if (claimed.length === 0) {
    await db.delete(generation_images).where(eq(generation_images.file_id, fileID))
    await db.delete(files).where(eq(files.id, fileID))
    await input.bucket.delete(key)
    return "failed"
  }
  await settle(db, { userID: g.user_id, generationID: g.id, costUsd })
  return "done"
}

// The workflow stops looking after half an hour: the run fails and is refunded.
export async function giveUpVideo(db: Database, generationID: string) {
  const g = await db.select().from(generations).where(eq(generations.id, generationID)).get()
  if (g?.status === "running") await failVideo(db, g, "timeout")
  return "failed"
}

async function failVideo(db: Database, g: Generation, error: string, costUsd = 0) {
  const claimed = await db
    .update(generations)
    .set({ status: "failed", error, credits_final: 0, cost_usd: (g.cost_usd ?? 0) + costUsd, finished_at: Date.now() })
    .where(and(eq(generations.id, g.id), eq(generations.status, "running")))
    .returning({ id: generations.id })
  if (claimed.length) await refund(db, { userID: g.user_id, generationID: g.id, reason: "video failed" })
}

function describe(error: Error) {
  return error instanceof VideoProviderError ? `${error.status}: ${error.message}` : error.message
}
