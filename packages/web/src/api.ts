export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message)
  }
}

type ErrorBody = { error?: { code?: string; message?: string } & Record<string, unknown> }

export async function api<T>(
  path: string,
  init?: { method?: string; body?: unknown; signal?: AbortSignal },
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body === undefined ? "GET" : "POST"),
    headers: init?.body === undefined ? undefined : { "content-type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
    signal: init?.signal,
  })
  if (res.ok) return (await res.json()) as T
  const body = (await res.json().catch(() => ({}))) as ErrorBody
  const { code, message, ...extra } = body.error ?? {}
  throw new ApiError(res.status, code ?? "UNKNOWN", message ?? `Lỗi ${res.status}`, extra)
}

export type SSEEvent = { event: string; data: unknown }

// POST + SSE response; EventSource only does GET so the stream is parsed by hand.
export async function* apiStream(path: string, body: unknown, signal?: AbortSignal): AsyncGenerator<SSEEvent> {
  const res = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body),
    credentials: "same-origin",
    signal,
  })
  if (!res.ok) {
    const parsed = (await res.json().catch(() => ({}))) as ErrorBody
    const { code, message, ...extra } = parsed.error ?? {}
    throw new ApiError(res.status, code ?? "UNKNOWN", message ?? `Lỗi ${res.status}`, extra)
  }
  if (!res.body) return
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const frames = buffer.split("\n\n")
    buffer = frames.pop() ?? ""
    for (const frame of frames) {
      let event = "message"
      const data: string[] = []
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim()
        if (line.startsWith("data:")) data.push(line.slice(5).trimStart())
      }
      if (data.length === 0) continue
      yield { event, data: JSON.parse(data.join("\n")) }
    }
  }
}
