import type { Context } from "hono"
import { streamSSE, type SSEStreamingApi } from "hono/streaming"
import type { AppEnv } from "../app"
import { runGeneration, type GenerationEvent } from "./generate"
import type { prepareGeneration } from "./prepare"
import { presentGeneration } from "./present"

// A picture renders for minutes without an event. A comment line every few seconds keeps phone
// networks from dropping the quiet connection, and lets the browser tell a stream that is working
// from one that stalled (it gives up after STREAM_IDLE_MS without a byte; see web/src/api.ts).
// Returns what stops it.
export function heartbeat(stream: SSEStreamingApi, everyMs = 15_000) {
  const timer = setInterval(() => void stream.write(": ping\n\n").catch(() => {}), everyMs)
  return () => clearInterval(timer)
}

// Streams a prepared run to the browser: its row first, then each picture as it lands, then how it
// ended. A browser that leaves mid-run does not stop it.
export function streamGeneration(
  c: Context<AppEnv>,
  prepared: Awaited<ReturnType<typeof prepareGeneration>>,
  apiKey: string,
) {
  return streamSSE(c, async (stream) => {
    let closed = false
    stream.onAbort(() => {
      closed = true
    })
    const emit = async (event: GenerationEvent) => {
      if (closed) return
      await stream.writeSSE({ event: event.type, data: JSON.stringify(event) }).catch(() => {
        closed = true
      })
    }
    await emit({ type: "start", ...presentGeneration(prepared.generation, []) } as never)
    const job = runGeneration({
      ...prepared,
      db: c.get("db"),
      bucket: c.env.BUCKET,
      apiKey,
      baseURL: c.env.OPENROUTER_BASE_URL,
      emit,
    })
    // Keeps the settle/refund alive for a short while if the browser leaves mid-generation.
    c.executionCtx.waitUntil(job)
    const stop = heartbeat(stream)
    await job.finally(stop)
  })
}
