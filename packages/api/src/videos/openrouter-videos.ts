import { z } from "zod"
import { BRAND, BRAND_URL } from "../brand"
import { DEFAULT_BASE_URL } from "../llm/openrouter"

// OpenRouter's video API: a job is submitted, polled until it is done, then its clip downloaded.
// https://openrouter.ai/docs/guides/overview/multimodal/video-generation

export type VideoJob = {
  // pending, in_progress, completed, failed, cancelled or expired.
  status: string
  error?: string
  costUsd: number
}

export class VideoProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

const Submitted = z.object({
  id: z.string().optional(),
  error: z.object({ message: z.string().optional() }).nullish(),
})

const Job = z.object({
  status: z.string(),
  error: z.union([z.string(), z.object({ message: z.string().optional() })]).nullish(),
  usage: z.object({ cost: z.number().nullish() }).nullish(),
})

type Connection = { apiKey: string; baseURL?: string }

const headers = (apiKey: string) => ({
  authorization: `Bearer ${apiKey}`,
  "content-type": "application/json",
  "http-referer": BRAND_URL,
  "x-title": BRAND,
})

export async function submitVideo(
  input: Connection & {
    slug: string
    prompt: string
    duration: number
    resolution: string
    aspectRatio: string
    // Whether the model makes the clip's sound.
    sound: boolean
    // Pictures the clip starts from and ends on, as data URLs; a last frame comes with a first.
    firstFrame?: string
    lastFrame?: string
  },
) {
  const frames = [
    { url: input.firstFrame, frame_type: "first_frame" },
    { url: input.lastFrame, frame_type: "last_frame" },
  ].flatMap((frame) =>
    frame.url ? [{ type: "image_url", image_url: { url: frame.url }, frame_type: frame.frame_type }] : [],
  )
  const res = await fetch(`${input.baseURL ?? DEFAULT_BASE_URL}/videos`, {
    method: "POST",
    headers: headers(input.apiKey),
    body: JSON.stringify({
      model: input.slug,
      prompt: input.prompt,
      duration: input.duration,
      resolution: input.resolution,
      aspect_ratio: input.aspectRatio,
      generate_audio: input.sound,
      frame_images: frames.length ? frames : undefined,
    }),
  })
  const body = Submitted.safeParse(await res.json().catch(() => undefined)).data
  if (!res.ok || !body?.id) throw new VideoProviderError(res.status, body?.error?.message ?? `HTTP ${res.status}`)
  return body.id
}

export async function videoJob(input: Connection & { jobID: string }): Promise<VideoJob> {
  const res = await fetch(`${input.baseURL ?? DEFAULT_BASE_URL}/videos/${input.jobID}`, {
    headers: headers(input.apiKey),
  })
  if (!res.ok) throw new VideoProviderError(res.status, `HTTP ${res.status}`)
  const body = Job.parse(await res.json())
  const error = typeof body.error === "string" ? body.error : (body.error?.message ?? undefined)
  return { status: body.status, error, costUsd: body.usage?.cost ?? 0 }
}

export async function downloadVideo(input: Connection & { jobID: string }) {
  const res = await fetch(`${input.baseURL ?? DEFAULT_BASE_URL}/videos/${input.jobID}/content?index=0`, {
    headers: headers(input.apiKey),
  })
  if (!res.ok) throw new VideoProviderError(res.status, `HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}
