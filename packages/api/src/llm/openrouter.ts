// Thin OpenAI-compatible streaming client for OpenRouter. Event names mirror @kiwii/llm so the
// consumer can swap to that package later without touching its callers.

import { BRAND, BRAND_URL } from "../brand"

export type ChatMessage =
  | { role: "system"; content: string }
  | {
      role: "user"
      content: string | Array<{ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }>
    }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string }

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } }

export type ToolDefinition = {
  type: "function"
  function: { name: string; description: string; parameters: Record<string, unknown> }
}

export type Usage = { input: number; output: number; cost?: number }

export type LLMEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; call: ToolCall }
  | { type: "finish"; reason: string; usage: Usage; model: string }
  | { type: "provider-error"; status: number; message: string; retryable: boolean }

export type StreamRequest = {
  apiKey: string
  // Overridable so local smoke tests can point at a mock server.
  baseURL?: string
  model: string
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

export const DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"

export async function* streamChat(request: StreamRequest): AsyncGenerator<LLMEvent> {
  const res = await fetch(`${request.baseURL ?? DEFAULT_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${request.apiKey}`,
      "content-type": "application/json",
      "http-referer": BRAND_URL,
      "x-title": BRAND,
    },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      tools: request.tools,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stream: true,
      usage: { include: true },
    }),
    signal: request.signal,
  })
  if (!res.ok || !res.body) {
    const message = await res.text().catch(() => "")
    yield {
      type: "provider-error",
      status: res.status,
      message: message.slice(0, 500),
      retryable: res.status === 429 || res.status >= 500,
    }
    return
  }

  const calls = new Map<number, ToolCall>()
  const usage: Usage = { input: 0, output: 0 }
  let finish = "stop"
  let model = request.model

  for await (const data of sseData(res.body)) {
    if (data === "[DONE]") break
    const chunk = parseChunk(data)
    if (!chunk) continue
    if (chunk.error) {
      yield { type: "provider-error", status: chunk.error.code ?? 500, message: chunk.error.message, retryable: false }
      return
    }
    if (chunk.model) model = chunk.model
    if (chunk.usage) {
      usage.input = chunk.usage.prompt_tokens ?? usage.input
      usage.output = chunk.usage.completion_tokens ?? usage.output
      usage.cost = chunk.usage.cost ?? usage.cost
    }
    const choice = chunk.choices?.[0]
    if (!choice) continue
    if (choice.finish_reason) finish = choice.finish_reason
    const delta = choice.delta
    if (delta?.content) yield { type: "text-delta", text: delta.content }
    for (const part of delta?.tool_calls ?? []) {
      const existing = calls.get(part.index)
      if (!existing) {
        calls.set(part.index, {
          id: part.id ?? `call_${part.index}`,
          type: "function",
          function: { name: part.function?.name ?? "", arguments: part.function?.arguments ?? "" },
        })
        continue
      }
      if (part.function?.name) existing.function.name += part.function.name
      if (part.function?.arguments) existing.function.arguments += part.function.arguments
    }
  }

  for (const call of calls.values()) yield { type: "tool-call", call }
  yield { type: "finish", reason: finish, usage, model }
}

// Tries each model in order and only falls through when the failure happened before any
// content was produced, so a user never sees two half answers glued together.
export async function* streamWithFallback(
  models: readonly string[],
  request: Omit<StreamRequest, "model">,
): AsyncGenerator<LLMEvent> {
  for (const [index, model] of models.entries()) {
    let produced = false
    for await (const event of streamChat({ ...request, model })) {
      if (event.type === "provider-error" && !produced && event.retryable && index < models.length - 1) break
      if (event.type === "text-delta" || event.type === "tool-call") produced = true
      yield event
      if (event.type === "finish" || event.type === "provider-error") return
    }
  }
}

type Chunk = {
  model?: string
  error?: { code?: number; message: string }
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number }
  choices?: Array<{
    finish_reason?: string | null
    delta?: {
      content?: string | null
      tool_calls?: Array<{ index: number; id?: string; function?: { name?: string; arguments?: string } }>
    }
  }>
}

function parseChunk(data: string): Chunk | undefined {
  try {
    return JSON.parse(data) as Chunk
  } catch {
    return undefined
  }
}

async function* sseData(body: ReadableStream<Uint8Array>) {
  const reader = body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      if (!line.startsWith("data:")) continue
      yield line.slice(5).trim()
    }
  }
}

// One buffered JSON-mode completion. `value` is the parsed reply, missing when it is empty or not
// JSON (the caller checks each field); `costUsd` is what OpenRouter billed either way (0 when the
// request failed).
export async function completeJSON(request: Omit<StreamRequest, "signal"> & { timeoutMs?: number }) {
  const res = await fetch(`${request.baseURL ?? DEFAULT_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${request.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: request.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      response_format: { type: "json_object" },
      // A short JSON answer needs no thinking. A thinking model otherwise spends max_tokens on it and
      // returns empty content; ASSISTANT_MODEL lets it be turned off.
      reasoning: { effort: "none" },
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(request.timeoutMs ?? 8000),
  })
  if (!res.ok) return { costUsd: 0, failure: `HTTP ${res.status}` }
  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>
    usage?: { cost?: number }
  }
  const costUsd = body.usage?.cost ?? 0
  const content = body.choices?.[0]?.message?.content
  if (!content) return { costUsd, failure: "empty reply" }
  const value = parseObject(content)
  return value ? { value, costUsd } : { costUsd, failure: "no JSON object in the reply" }
}

// Some models wrap the object in a code fence or a sentence even in JSON mode.
function parseObject(text: string): Record<string, unknown> | undefined {
  const start = text.indexOf("{")
  const end = text.lastIndexOf("}")
  if (start < 0 || end <= start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
  } catch {
    return undefined
  }
}
