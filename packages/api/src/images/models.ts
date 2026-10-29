import { eq } from "drizzle-orm"
import type { Database } from "../db/client"
import { app_config } from "../db/schema"

export const ImageModelID = ["flux-3-klein", "nano-banana-2.1", "gpt-image-2.5"] as const
export type ImageModelID = (typeof ImageModelID)[number]

export type ImageOption = {
  id: string
  label_vi: string
  label_en: string
  // null = hidden until the calibration script fills in a price.
  credits: number | null
}

export type ImageModel = {
  id: ImageModelID
  slug: string
  name: string
  tagline_vi: string
  tagline_en: string
  // Which request field the option maps to on OpenRouter.
  param: "resolution" | "quality"
  options: ImageOption[]
  aspectRatios: string[]
  maxReferences: number
  // Longest edge, in pixels, a reference may have; the browser scales photos down to it before
  // uploading. FLUX refuses anything over 20 megapixels, Gemini tiles inputs at 768px so more
  // detail is wasted, GPT Image takes large files but gains nothing past this.
  maxReferenceEdge: number
  // Credits added once to a run that has reference pictures, where the provider bills the pictures
  // it reads (OpenRouter does for Gemini and GPT Image, not for FLUX 3 Klein).
  referenceSurcharge: number
  // Providers that only take n=1 get one request per image.
  multiImage: boolean
  streaming: boolean
}

// Credits = ceil(OpenRouter price × 1.055 fee × 1.3 margin / 0.030 $ per credit at Ultra).
// Verified prices 2026-10-27; see the plan for the full table.
export const IMAGE_MODELS: ImageModel[] = [
  {
    id: "flux-3-klein",
    slug: "black-forest-labs/flux-3-image-klein",
    name: "FLUX 3 Klein",
    tagline_vi: "Nhanh và rẻ, hợp phác thảo ý tưởng",
    tagline_en: "Fast and cheap, great for drafts",
    param: "resolution",
    options: [
      { id: "1K", label_vi: "1K", label_en: "1K", credits: 1 },
      { id: "2K", label_vi: "2K", label_en: "2K", credits: 1 },
      { id: "4K", label_vi: "4K", label_en: "4K", credits: 2 },
    ],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"],
    maxReferences: 4,
    maxReferenceEdge: 4096,
    referenceSurcharge: 0,
    multiImage: false,
    streaming: false,
  },
  {
    id: "nano-banana-2.1",
    slug: "google/gemini-nano-banana-2.1",
    name: "Nano Banana 2.1",
    tagline_vi: "Chỉnh sửa ảnh và giữ nhân vật tốt",
    tagline_en: "Strong at edits and consistent characters",
    param: "resolution",
    options: [
      { id: "1K", label_vi: "1K", label_en: "1K", credits: 2 },
      { id: "2K", label_vi: "2K", label_en: "2K", credits: 3 },
      { id: "4K", label_vi: "4K", label_en: "4K", credits: 5 },
    ],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"],
    maxReferences: 4,
    maxReferenceEdge: 3072,
    referenceSurcharge: 1,
    multiImage: false,
    streaming: false,
  },
  {
    id: "gpt-image-2.5",
    slug: "openai/gpt-image-2.5-sunburst",
    name: "GPT Image 2.5",
    tagline_vi: "Chữ trong ảnh và chi tiết chính xác nhất",
    tagline_en: "Best text rendering and fine detail",
    param: "quality",
    options: [
      { id: "low", label_vi: "Nháp", label_en: "Draft", credits: 1 },
      { id: "medium", label_vi: "Tiêu chuẩn", label_en: "Standard", credits: 3 },
      { id: "high", label_vi: "Cao", label_en: "High", credits: 10 },
      { id: "xhigh", label_vi: "Rất cao", label_en: "XHigh", credits: null },
      { id: "max", label_vi: "Tối đa", label_en: "Max", credits: null },
    ],
    aspectRatios: ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9"],
    maxReferences: 4,
    maxReferenceEdge: 4096,
    referenceSurcharge: 1,
    multiImage: true,
    streaming: true,
  },
]

export const MAX_IMAGES_PER_RUN = 4
// Reference pictures one run may carry, whatever a model would take.
export const MAX_REFERENCES = 4

// app_config.image_models = { "<model id>": { "<option id>": credits | null } } overrides the
// defaults above so prices can be recalibrated without a deploy.
export type CreditOverrides = Partial<Record<ImageModelID, Record<string, number | null>>>

export async function loadImageModels(db: Database): Promise<ImageModel[]> {
  const row = await db
    .select({ value: app_config.value })
    .from(app_config)
    .where(eq(app_config.key, "image_models"))
    .get()
  if (!row) return IMAGE_MODELS
  const overrides = parseOverrides(row.value)
  return IMAGE_MODELS.map((model) => ({
    ...model,
    options: model.options.map((option) => {
      const credits = overrides[model.id]?.[option.id]
      return credits === undefined ? option : { ...option, credits }
    }),
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

export function imageCreditCost(
  models: ImageModel[],
  input: { model: string; option: string; n: number; references: number },
) {
  const model = models.find((m) => m.id === input.model)
  const option = model?.options.find((o) => o.id === input.option)
  if (!model || !option || option.credits === null) return undefined
  if (input.n < 1 || input.n > MAX_IMAGES_PER_RUN) return undefined
  return option.credits * input.n + (input.references > 0 ? model.referenceSurcharge : 0)
}
