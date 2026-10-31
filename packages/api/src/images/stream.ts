import type { Context } from "hono"
import { streamSSE } from "hono/streaming"
import type { AppEnv } from "../app"
import { runGeneration, type GenerationEvent } from "./generate"
import type { prepareGeneration } from "./prepare"
import { presentGeneration } from "./present"

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
    await job
  })
}
