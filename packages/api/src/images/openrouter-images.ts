import { DEFAULT_BASE_URL } from "../llm/openrouter"

export type ImageReference = { type: "image_url"; image_url: { url: string } }

export type ImageRequest = {
  apiKey: string
  baseURL?: string
  slug: string
  prompt: string
  n: number
  aspectRatio: string
  resolution?: string
  quality?: string
  references: ImageReference[]
  signal?: AbortSignal
}

export type GeneratedImage = { bytes: Uint8Array; mime: string }

export type ImageResult = { images: GeneratedImage[]; costUsd: number }

export class ImageProviderError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export type ImageEvent =
  | { type: "partial"; index: number; b64: string }
  | { type: "completed"; result: ImageResult }
  | { type: "error"; error: ImageProviderError }

function body(request: ImageRequest, stream: boolean) {
  return JSON.stringify({
    model: request.slug,
    prompt: request.prompt,
    n: request.n,
    aspect_ratio: request.aspectRatio,
    resolution: request.resolution,
    quality: request.quality,
    input_references: request.references.length ? request.references : undefined,
    // No output_format / output_compression: OpenRouter rejects parameters an endpoint does not
    // list (FLUX 3 answers 400), so the provider's default encoding is used and media_type is
    // trusted on the way back.
    stream,
  })
}

function headers(apiKey: string) {
  return {
    authorization: `Bearer ${apiKey}`,
    "content-type": "application/json",
    "http-referer": "https://kiwiiagent.com",
    "x-title": "Kiwii",
  }
}

async function failure(res: Response) {
  const text = await res.text().catch(() => "")
  let message = text.slice(0, 300)
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } }
    if (parsed.error?.message) message = parsed.error.message
  } catch {}
  return new ImageProviderError(res.status, message || `HTTP ${res.status}`)
}

function decode(b64: string) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

type Buffered = {
  data?: Array<{ b64_json?: string; media_type?: string }>
  usage?: { cost?: number }
  error?: { message?: string; code?: number }
}

// One buffered request. Billing is all-or-nothing on OpenRouter, so an error means no charge.
export async function generateImages(request: ImageRequest): Promise<ImageResult> {
  const res = await fetch(`${request.baseURL ?? DEFAULT_BASE_URL}/images`, {
    method: "POST",
    headers: headers(request.apiKey),
    body: body(request, false),
    signal: request.signal,
  })
  if (!res.ok) throw await failure(res)
  const parsed = (await res.json()) as Buffered
  if (parsed.error) throw new ImageProviderError(parsed.error.code ?? 502, parsed.error.message ?? "Provider error")
  const images = (parsed.data ?? [])
    .filter((item) => typeof item.b64_json === "string" && item.b64_json.length > 0)
    .map((item) => ({ bytes: decode(item.b64_json!), mime: item.media_type ?? "image/jpeg" }))
  if (images.length === 0) throw new ImageProviderError(502, "Provider returned no image")
  return { images, costUsd: parsed.usage?.cost ?? 0 }
}

type StreamChunk = {
  type?: string
  partial_image_index?: number
  b64_json?: string
  media_type?: string
  usage?: { cost?: number }
  error?: { message?: string; code?: number | string }
}

// SSE variant for models with supports_streaming (GPT Image). Yields partial previews, then one
// completed event; the stream ends with [DONE].
export async function* streamImages(request: ImageRequest): AsyncGenerator<ImageEvent> {
  const res = await fetch(`${request.baseURL ?? DEFAULT_BASE_URL}/images`, {
    method: "POST",
    headers: headers(request.apiKey),
    body: body(request, true),
    signal: request.signal,
  })
  if (!res.ok || !res.body) {
    yield { type: "error", error: await failure(res) }
    return
  }
  if (!res.headers.get("content-type")?.includes("text/event-stream")) {
    // Some endpoints ignore stream=true and answer with the buffered shape.
    const parsed = (await res.json()) as Buffered
    const images = (parsed.data ?? [])
      .filter((item) => typeof item.b64_json === "string")
      .map((item) => ({ bytes: decode(item.b64_json!), mime: item.media_type ?? "image/jpeg" }))
    if (images.length === 0) yield { type: "error", error: new ImageProviderError(502, "Provider returned no image") }
    else yield { type: "completed", result: { images, costUsd: parsed.usage?.cost ?? 0 } }
    return
  }
  const images: GeneratedImage[] = []
  let cost = 0
  let completed = false
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data:")) continue
      const data = line.slice(5).trim()
      if (data === "[DONE]") continue
      let chunk: StreamChunk
      try {
        chunk = JSON.parse(data) as StreamChunk
      } catch {
        continue
      }
      if (chunk.type === "error" || chunk.error) {
        const code = Number(chunk.error?.code)
        yield {
          type: "error",
          error: new ImageProviderError(
            Number.isFinite(code) ? code : 502,
            chunk.error?.message ?? "Generation failed",
          ),
        }
        return
      }
      if (chunk.type === "image_generation.partial_image" && chunk.b64_json) {
        yield { type: "partial", index: chunk.partial_image_index ?? images.length, b64: chunk.b64_json }
        continue
      }
      if (chunk.type === "image_generation.completed" && chunk.b64_json) {
        images.push({ bytes: decode(chunk.b64_json), mime: chunk.media_type ?? "image/jpeg" })
        cost += chunk.usage?.cost ?? 0
        completed = true
      }
    }
  }
  if (!completed) {
    yield { type: "error", error: new ImageProviderError(502, "Stream ended without an image") }
    return
  }
  yield { type: "completed", result: { images, costUsd: cost } }
}
