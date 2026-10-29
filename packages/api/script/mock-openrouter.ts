// Local stand-in for OpenRouter so the web app can be developed and tested without spending
// credits. Point the Worker at it with OPENROUTER_BASE_URL=http://localhost:8899 in .dev.vars.
//
//   bun script/mock-openrouter.ts            (port 8899, or MOCK_PORT)
//
// JSON-mode chat calls answer like the prompt screener and rewriter ("BLOCKME" is refused). Streamed
// calls answer like the image assistant: a greeting gets words only; "2 phương án" starts two runs;
// "đổi", "sửa" or "thêm" works from the newest picture (#1); "9:16" asks for that frame; anything else
// starts one run with the message as its prompt; after the tools it says it is done, or why not. The
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
  const messages = body.messages as Array<{ role: string; content: string | Array<{ type: string; text?: string }> }>
  const last = messages.at(-1)
  if (body.stream) return assistant(body, messages)
  if (!body.response_format) return Response.json({ error: { message: "mock: JSON mode only" } }, { status: 400 })
  // The person's words, followed by small copies of their pictures when they attached some.
  const parts = Array.isArray(last?.content) ? last.content : []
  const text = typeof last?.content === "string" ? last.content : (parts[0]?.text ?? "")
  const pictures = parts.filter((part) => part.type === "image_url").length
  if (pictures) console.log(`[mock] the rewrite looked at ${pictures} picture(s)`)
  const blocked = text.includes("BLOCKME")
  const content = JSON.stringify({
    allowed: !blocked,
    reason: blocked ? "Nội dung không được phép (mock)" : "",
    // Numbered, so every rewrite differs and a retry that rewrote again would send a new prompt.
    prompt: `Enhanced #${++rewrites}: ${text}, cinematic lighting, 35mm`,
  })
  return Response.json({ choices: [{ message: { content } }], usage: { cost: 0.00012 } })
}

async function assistant(body: Record<string, unknown>, messages: Array<{ role: string; content: unknown }>) {
  const model = body.model
  const last = messages.at(-1)
  const finish = (reason: string) => ({
    model,
    choices: [{ delta: {}, finish_reason: reason }],
    usage: { prompt_tokens: 900, completion_tokens: 40, cost: 0.00021 },
  })
  const say = (text: string, reason = "stop") =>
    sse(async (send) => {
      for (const word of text.split(/(?<=\s)/)) {
        send({ model, choices: [{ delta: { content: word } }] })
        await Bun.sleep(15)
      }
      send(finish(reason))
    })
  if (last?.role === "tool") {
    // Only this message's calls: the history replays earlier runs as tool results too.
    const results = messages
      .slice(messages.findLastIndex((m) => m.role === "user") + 1)
      .filter((m) => m.role === "tool")
      .map((m) => String(m.content))
    const refused = results.find((r) => r.includes('"error"'))
    if (refused) return say(`Mình chưa tạo được ảnh này: ${(JSON.parse(refused) as { error: string }).error}`)
    return say("Xong rồi! Ảnh đang được vẽ, bạn xem trong thư viện của dự án nhé.")
  }
  const text = typeof last?.content === "string" ? last.content : ""
  if (/^(xin chào|chào|hello|hi)\b/i.test(text.trim())) return say("Chào bạn! Bạn muốn tạo ảnh gì hôm nay?")
  const frame = text.includes("9:16") ? { aspect_ratio: "9:16" } : {}
  const calls = /2 phương án/i.test(text)
    ? [1, 2].map((n) => ({ prompt: `${text}, phương án ${n}`, count: 1, ...frame }))
    : /(^|\s)(đổi|sửa|thêm)(\s|$)/i.test(text)
      ? [{ prompt: `${text}, giữ nguyên bố cục ảnh trước`, reference_images: ["#1"], ...frame }]
      : [{ prompt: text, ...frame }]
  return sse(async (send) => {
    send({ model, choices: [{ delta: { content: "Mình tạo ngay cho bạn." } }] })
    for (const [index, args] of calls.entries()) {
      const json = JSON.stringify(args)
      // Arguments arrive in pieces, as they do from a real provider.
      send({
        model,
        choices: [
          {
            delta: {
              tool_calls: [
                { index, id: `call_${index}`, function: { name: "generate_image", arguments: json.slice(0, 12) } },
              ],
            },
          },
        ],
      })
      send({ model, choices: [{ delta: { tool_calls: [{ index, function: { arguments: json.slice(12) } }] } }] })
    }
    send(finish("tool_calls"))
  })
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
