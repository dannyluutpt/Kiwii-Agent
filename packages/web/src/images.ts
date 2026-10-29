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
  maxReferenceEdge: number
  // Credits a run with reference pictures adds, where the provider bills them.
  referenceSurcharge: number
}
export type ModelsResponse = {
  canGenerate: boolean
  trial: boolean
  parallelLimit: number
  maxImages: number
  maxReferences: number
  // Saved characters one run may feature.
  maxCharacters: number
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
  referenceFileIDs: string[]
  characterIDs: string[]
  creditsReserved: number
  creditsFinal: number | null
  error: string | null
  // The project the run belongs to; null for runs made outside one.
  projectID: string | null
  createdAt: number
  finishedAt: number | null
  images: GenerationImage[]
  // Client-only: streamed previews (data URLs), the refund reported by the stream, and a run the
  // server has not accepted yet (the prompt is being prepared).
  previews?: Record<number, string>
  refunded?: number
  errorMessage?: string
  preparing?: boolean
}

// A turn of a project's conversation with the image assistant. The person's turn holds their text
// and the pictures they attached; the assistant's holds its reply, the runs it started and a notice
// for a run that could not start. `pending` is a reply still being written, `failed` why it stopped.
export type MessagePart =
  | { type: "text"; text: string }
  | { type: "image"; fileID: string }
  | { type: "character"; id: string; name: string }
  | { type: "generation"; id: string }
  | { type: "notice"; code: string; message: string }
export type Message = {
  id: string
  role: "user" | "assistant"
  parts: MessagePart[]
  createdAt: number
  pending?: boolean
  failed?: string
}

// `edge` is the longest side of the stored copy, so a model with a smaller limit can be served a
// smaller copy.
export type Reference = { id: string; url: string; name: string; edge: number }

// A person (or a mascot) saved from one to four photos, for every project; the first photo is its face.
export type Character = { id: string; name: string; images: Array<{ fileID: string; url: string }>; createdAt: number }

export const aspectStyle = (ratio: string) => ({ "aspect-ratio": ratio.replace(":", " / ") })

// Columns for a run's pictures, and a width cap so tall frames stay within the screen instead of
// stretching to the full card width.
export function gridFor(n: number, ratio: string) {
  const [w = 1, h = 1] = ratio.split(":").map(Number)
  const layout =
    n === 1
      ? { columns: "grid-cols-1", across: 1, height: 60, cap: "32rem" }
      : n === 2
        ? { columns: "grid-cols-2", across: 2, height: 50, cap: "100%" }
        : n === 3
          ? { columns: "grid-cols-3", across: 3, height: 45, cap: "100%" }
          : { columns: "grid-cols-2", across: 2, height: 32, cap: "32rem" }
  return {
    class: layout.columns,
    style: { "max-width": `min(100%, ${layout.cap}, calc(${layout.across} * ${layout.height}dvh * ${w} / ${h}))` },
  }
}

// Screen readers hear what the picture shows, in the customer's own words, kept short.
export const altFor = (g: Pick<Generation, "prompt">) => g.prompt.slice(0, 120)

export type StudioSettings = {
  model: string
  option: string
  aspectRatio: string
  n: number
}
