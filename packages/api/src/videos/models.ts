import { eq } from "drizzle-orm"
import type { Database } from "../db/client"
import { app_config } from "../db/schema"

export const VideoModelID = ["wan-3.0", "hailuo-3-max"] as const
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
  // Whether the clip comes with sound the model makes; OpenRouter turns it on by default.
  sound: boolean
  // A picture the clip starts from (its first frame).
  maxReferences: number
  maxReferenceEdge: number
}

// Credits = ceil(OpenRouter price for the clip × 25,460 đ/USD ÷ (1,083 đ × 0.45)): at least a 55%
// gross margin on the cheapest credit, Ultra's. Prices from GET /api/v1/videos/models on
// 2026-10-29: Wan 3.0 0.10 USD/s at 720p and 0.20 at 1080p, Hailuo 3 Max 0.08 USD/s at 768p.
export const VIDEO_MODELS: VideoModel[] = [
  {
    id: "wan-3.0",
    slug: "alibaba/wan-3.0",
    name: "Wan 3.0",
    tagline_vi: "Làm đúng ý prompt nhất, có âm thanh",
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
  },
  {
    id: "hailuo-3-max",
    slug: "minimax/hailuo-3-max",
    name: "Hailuo 3 Max",
    tagline_vi: "Nhanh, chuyển động thật, không có tiếng",
    tagline_en: "Fast, lifelike motion, no sound",
    options: [{ id: "768p", label_vi: "768p", label_en: "768p", credits: { 5: 21, 10: 42 } }],
    durations: [5, 10],
    aspectRatios: ["16:9", "9:16", "1:1", "4:3", "3:4", "21:9"],
    sound: false,
    maxReferences: 1,
    maxReferenceEdge: 1920,
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

export function videoCreditCost(models: VideoModel[], input: { model: string; option: string; duration: number }) {
  const model = models.find((m) => m.id === input.model)
  const option = model?.options.find((o) => o.id === input.option)
  if (!model || !option || !model.durations.includes(input.duration)) return undefined
  return option.credits[input.duration]
}
