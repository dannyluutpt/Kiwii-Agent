// Local stand-in for OpenRouter so the web app can be developed and tested without spending
// credits. Point the Worker at it with OPENROUTER_BASE_URL=http://localhost:8899 in .dev.vars.
//
//   bun script/mock-openrouter.ts            (port 8899, or MOCK_PORT)
//
// JSON-mode chat calls answer like the prompt screener and rewriter ("BLOCKME" is refused). The
// Images API returns gradient PNGs; "FAIL" in the prompt returns 400, and "FAILONCE" fails only the
// first time that exact prompt arrives.
import { deflateSync } from "node:zlib"

const port = Number(process.env.MOCK_PORT ?? 8899)
const encoder = new TextEncoder()
let calls = 0
let rewrites = 0

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url)
    const body = (await req.json()) as Record<string, unknown>
    calls++
    console.log(`[mock] #${calls} ${url.pathname} model=${String(body.model)} stream=${String(body.stream)}`)
    if (url.pathname.endsWith("/images")) return images(body)
    return chat(body)
  },
})
console.log(`mock openrouter on :${port}`)

// Prompts the Images API has refused once; "FAILONCE" fails only the first time a prompt is seen, so
// a retry succeeds only when it sends the very same prompt.
const refused = new Set<string>()

async function images(body: Record<string, unknown>) {
  await Bun.sleep(1200)
  const prompt = String(body.prompt)
  if (prompt.includes("FAILONCE") && !refused.has(prompt)) {
    refused.add(prompt)
    return Response.json({ error: { message: "provider overloaded" } }, { status: 503 })
  }
  if (prompt.includes("FAIL") && !prompt.includes("FAILONCE")) {
    return Response.json({ error: { message: "moderation blocked" } }, { status: 400 })
  }
  const [w, h] = size(String(body.aspect_ratio ?? "1:1"))
  const seed = calls
  if (!body.stream) {
    return Response.json({
      created: Date.now(),
      data: [{ b64_json: png(w, h, seed), media_type: "image/png" }],
      usage: { cost: 0.014 },
    })
  }
  const n = Number(body.n ?? 1)
  return sse(async (send) => {
    for (const i of Array.from({ length: n }, (_, k) => k)) {
      send({ type: "image_generation.partial_image", partial_image_index: i, b64_json: png(64, 64, seed + i) })
      await Bun.sleep(600)
      send({
        type: "image_generation.completed",
        b64_json: png(w, h, seed + i),
        media_type: "image/png",
        usage: { cost: 0.05 },
      })
    }
  })
}

// The prompt screener and rewriter is the only chat-completions caller; it asks for JSON.
async function chat(body: Record<string, unknown>) {
  const messages = body.messages as Array<{ role: string; content: unknown }>
  const last = messages.at(-1)
  const text = typeof last?.content === "string" ? last.content : ""
  if (!body.response_format) return Response.json({ error: { message: "mock: JSON mode only" } }, { status: 400 })
  const blocked = text.includes("BLOCKME")
  const content = JSON.stringify({
    allowed: !blocked,
    reason: blocked ? "Nội dung không được phép (mock)" : "",
    // Numbered, so every rewrite differs and a retry that rewrote again would send a new prompt.
    prompt: `Enhanced #${++rewrites}: ${text}, cinematic lighting, 35mm`,
  })
  return Response.json({ choices: [{ message: { content } }], usage: { cost: 0.00012 } })
}

function sse(produce: (send: (data: unknown) => void) => Promise<void>) {
  const stream = new ReadableStream({
    async start(controller) {
      await produce((data) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)))
      controller.enqueue(encoder.encode("data: [DONE]\n\n"))
      controller.close()
    },
  })
  return new Response(stream, { headers: { "content-type": "text/event-stream" } })
}

function size(ratio: string) {
  if (ratio === "16:9") return [640, 360]
  if (ratio === "9:16") return [360, 640]
  if (ratio === "4:3") return [640, 480]
  if (ratio === "3:4") return [480, 640]
  return [512, 512]
}

// Gradient PNG so each image is recognisably different.
function png(w: number, h: number, seed: number) {
  const raw = new Uint8Array((w * 3 + 1) * h)
  for (const y of Array.from({ length: h }, (_, k) => k)) {
    const row = y * (w * 3 + 1)
    raw[row] = 0
    for (const x of Array.from({ length: w }, (_, k) => k)) {
      const i = row + 1 + x * 3
      raw[i] = (x * 255) / w
      raw[i + 1] = (y * 255) / h
      raw[i + 2] = (seed * 60) % 255
    }
  }
  const header = new Uint8Array(13)
  const view = new DataView(header.buffer)
  view.setUint32(0, w)
  view.setUint32(4, h)
  header.set([8, 2, 0, 0, 0], 8)
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", new Uint8Array(deflateSync(raw))),
    chunk("IEND", new Uint8Array()),
  ]
  return Buffer.concat(parts).toString("base64")
}

function chunk(type: string, data: Uint8Array) {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(encoder.encode(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function crc32(bytes: Uint8Array) {
  const table = Array.from({ length: 8 })
  const crc = bytes.reduce((c, b) => table.reduce<number>((acc) => (acc >>> 1) ^ (0xedb88320 & -(acc & 1)), c ^ b), ~0)
  return ~crc >>> 0
}
