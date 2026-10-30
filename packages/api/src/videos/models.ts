import { eq } from "drizzle-orm"
import type { Database } from "../db/client"
import { app_config } from "../db/schema"

export const VideoModelID = ["wan-3.0", "minimax-h3", "seedance-2.5"] as const
export type VideoModelID = (typeof VideoModelID)[number]

export type VideoOption = {
  // The resolution sent to OpenRouter.
  id: string
  label_vi: string
  label_en: string
  // Credits per clip, by its length in seconds.
  credits: Record<number, number>
}

export type VideoModel = {
  id: VideoModelID
  slug: string
  name: string
  tagline_vi: string
  tagline_en: string
  options: VideoOption[]
  durations: number[]
  aspectRatios: string[]
  // Whether the model makes the clip's sound; sent to OpenRouter as generate_audio.
  sound: boolean
  // A picture the clip starts from (its first frame).
  maxReferences: number
  maxReferenceEdge: number
  // Credits added when the clip starts from a picture, where OpenRouter bills it as a reference.
  firstFrameCredits: number
}

// Credits = ceil(OpenRouter price for the clip × 25,460 đ/USD ÷ (1,083 đ × 0.45)): at least a 55%
// gross margin on the cheapest credit, Ultra's. Prices from GET /api/v1/videos/models on
// 2026-10-29: Wan 3.0 0.10 USD/s at 720p and 0.20 at 1080p; MiniMax H3 0.13 USD/s at 2K, its first
// five reference pictures free; Seedance 2.5 0.0000107 USD a video token, with (width × height ×
// seconds × 24) / 1024 tokens, so 0.233 USD/s at 720p in its largest frame (1112×834).
export const VIDEO_MODELS: VideoModel[] = [
  {
    id: "wan-3.0",
    slug: "alibaba/wan-3.0",
    name: "Wan 3.0",
    tagline_vi: "Đúng ý prompt nhất, có âm thanh",
    tagline_en: "Follows prompts best, with sound",
    options: [
      { id: "720p", label_vi: "720p", label_en: "720p", credits: { 5: 27, 10: 53 } },
      { id: "1080p", label_vi: "1080p", label_en: "1080p", credits: { 5: 53, 10: 105 } },
    ],
    durations: [5, 10],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4"],
    sound: true,
    maxReferences: 1,
    maxReferenceEdge: 1920,
    firstFrameCredits: 0,
  },
  {
    id: "minimax-h3",
    slug: "minimax/hailuo-3",
    name: "MiniMax H3",
    tagline_vi: "Nét 2K, giữ chữ và logo, có âm thanh",
    tagline_en: "Sharp 2K that keeps text and logos, with sound",
    options: [{ id: "2K", label_vi: "2K", label_en: "2K", credits: { 5: 34, 10: 68 } }],
    durations: [5, 10],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    sound: true,
    maxReferences: 1,
    maxReferenceEdge: 1920,
    firstFrameCredits: 0,
  },
  {
    id: "seedance-2.5",
    slug: "bytedance/seedance-2.5",
    name: "Seedance 2.5",
    tagline_vi: "Chuyển động tự nhiên, hợp kể chuyện, có âm thanh",
    tagline_en: "Natural motion for storytelling, with sound",
    options: [{ id: "720p", label_vi: "720p", label_en: "720p", credits: { 5: 61, 10: 122 } }],
    durations: [5, 10],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    sound: true,
    maxReferences: 1,
    maxReferenceEdge: 1920,
    firstFrameCredits: 0,
  },
]

type CreditOverrides = Partial<Record<string, Record<string, Record<string, number>>>>

// app_config.video_models = { "<model id>": { "<option id>": { "<seconds>": credits } } } changes a
// price without a deploy.
export async function loadVideoModels(db: Database): Promise<VideoModel[]> {
  const row = await db
    .select({ value: app_config.value })
    .from(app_config)
    .where(eq(app_config.key, "video_models"))
    .get()
  if (!row) return VIDEO_MODELS
  const overrides = parseOverrides(row.value)
  return VIDEO_MODELS.map((model) => ({
    ...model,
    options: model.options.map((option) => ({
      ...option,
      credits: Object.fromEntries(
        model.durations.map((seconds) => [
          seconds,
          overrides[model.id]?.[option.id]?.[String(seconds)] ?? option.credits[seconds]!,
        ]),
      ),
    })),
  }))
}

function parseOverrides(text: string): CreditOverrides {
  try {
    const parsed = JSON.parse(text) as unknown
    return parsed && typeof parsed === "object" ? (parsed as CreditOverrides) : {}
  } catch {
    return {}
  }
}

export function videoCreditCost(
  models: VideoModel[],
  input: { model: string; option: string; duration: number; firstFrame?: boolean },
) {
  const model = models.find((m) => m.id === input.model)
  if (!model || !model.durations.includes(input.duration)) return undefined
  const credits = model.options.find((o) => o.id === input.option)?.credits[input.duration]
  if (credits === undefined) return undefined
  return credits + (input.firstFrame ? model.firstFrameCredits : 0)
}
