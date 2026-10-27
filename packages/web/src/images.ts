// Shared types for the image studio and the assets page.

export type ImageOption = { id: string; label: string; credits: number }
export type ImageModel = {
  id: string
  name: string
  tagline: string
  param: "resolution" | "quality"
  options: ImageOption[]
  aspectRatios: string[]
  maxReferences: number
}
export type ModelsResponse = {
  canGenerate: boolean
  trial: boolean
  parallelLimit: number
  maxImages: number
  maxReferences: number
  referenceSurcharge: number
  credits: number
  models: ImageModel[]
}

export type GenerationImage = { id: string; fileID: string; position: number; url: string }
export type Generation = {
  id: string
  status: "running" | "done" | "failed"
  model: string
  option: string
  aspectRatio: string
  n: number
  prompt: string
  promptEnhanced: string | null
  referenceFileIDs: string[]
  creditsReserved: number
  creditsFinal: number | null
  error: string | null
  createdAt: number
  finishedAt: number | null
  images: GenerationImage[]
  // Client-only: streamed previews (data URLs) and the refund reported by the stream.
  previews?: Record<number, string>
  refunded?: number
  errorMessage?: string
}

export type Reference = { id: string; url: string; name: string }

export const aspectStyle = (ratio: string) => ({ "aspect-ratio": ratio.replace(":", " / ") })
