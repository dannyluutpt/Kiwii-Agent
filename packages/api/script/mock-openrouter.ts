// Local stand-in for OpenRouter so the web app can be developed and tested without spending
// credits. Point the Worker at it with OPENROUTER_BASE_URL=http://localhost:8899 in .dev.vars.
//
//   bun script/mock-openrouter.ts            (port 8899, or MOCK_PORT)
//
// Chat streams a short markdown answer word by word; a prompt containing "dài" or "long" streams a
// long one (for scroll tests), "excel"/"word"/"file"/"tệp" triggers a file tool call and "giá vàng" a
// web_search call when tools are offered, "RATELIMIT" returns 429. JSON-mode calls answer like the prompt enhancer ("BLOCKME" is
// refused). The Images API returns gradient PNGs; "FAIL" in the prompt returns 400.
import { deflateSync } from "node:zlib"

const port = Number(process.env.MOCK_PORT ?? 8899)
const encoder = new TextEncoder()
let calls = 0

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

async function images(body: Record<string, unknown>) {
  await Bun.sleep(1200)
  if (String(body.prompt).includes("FAIL")) {
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

async function chat(body: Record<string, unknown>) {
  const messages = body.messages as Array<{ role: string; content: unknown }>
  const last = messages.at(-1)
  const text = typeof last?.content === "string" ? last.content : ""
  if (body.response_format) {
    const blocked = text.includes("BLOCKME")
    const content = JSON.stringify({
      allowed: !blocked,
      reason: blocked ? "Nội dung không được phép (mock)" : "",
      prompt: `Enhanced: ${text}, cinematic lighting, 35mm`,
    })
    return Response.json({ choices: [{ message: { content } }], usage: { cost: 0.00012 } })
  }
  if (text.includes("RATELIMIT")) return Response.json({ error: { message: "rate limited" } }, { status: 429 })
  const model = body.model
  // A buffered call with the web plugin answers like OpenRouter's web search: a summary plus
  // url_citation annotations.
  if (Array.isArray(body.plugins)) {
    // A real search takes a moment; long enough for the status line to show.
    await new Promise((resolve) => setTimeout(resolve, 700))
    return Response.json({
      choices: [
        {
          message: {
            content: `Kết quả mock cho "${text}": giá vàng SJC hôm nay là 150 triệu đồng một lượng.`,
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  url: "https://example.com/gia-vang",
                  title: "Giá vàng hôm nay",
                  content: "SJC 150 triệu",
                },
              },
              {
                type: "url_citation",
                url_citation: { url: "https://example.com/gia-vang", title: "Trùng", content: "bỏ qua" },
              },
            ],
          },
        },
      ],
      usage: { prompt_tokens: 40, completion_tokens: 30, cost: 0.0071 },
    })
  }
  if (last?.role === "tool" && String(last.content).includes('"results"')) {
    return sse(async (send) => {
      send({
        model,
        choices: [
          {
            delta: {
              content: "Theo [Giá vàng hôm nay](https://example.com/gia-vang), SJC đang ở 150 triệu đồng một lượng.",
            },
          },
        ],
      })
      send({
        model,
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 60, completion_tokens: 20, cost: 0.00006 },
      })
    })
  }
  if (last?.role === "tool") {
    return sse(async (send) => {
      send({ model, choices: [{ delta: { content: "Tệp đã sẵn sàng, bạn tải ở bên dưới nhé." } }] })
      send({
        model,
        choices: [{ delta: {}, finish_reason: "stop" }],
        usage: { prompt_tokens: 50, completion_tokens: 12, cost: 0.00005 },
      })
    })
  }
  if (Array.isArray(body.tools) && /excel|word|file|tệp|giá vàng/i.test(text)) {
    const call = /giá vàng/i.test(text)
      ? { name: "web_search", arguments: JSON.stringify({ query: "giá vàng SJC hôm nay" }) }
      : /excel/i.test(text)
        ? {
            name: "create_xlsx",
            arguments: JSON.stringify({
              filename: "doanh-thu",
              sheets: [
                {
                  name: "Q3",
                  rows: [
                    ["Tháng", "Doanh thu"],
                    ["7", 100],
                    ["8", 250],
                  ],
                },
              ],
            }),
          }
        : {
            name: "create_docx",
            arguments: JSON.stringify({
              filename: "bao-cao",
              title: "Báo cáo",
              blocks: [
                { type: "heading", text: "Tổng quan", level: 1 },
                { type: "paragraph", text: "Nội dung báo cáo." },
              ],
            }),
          }
    return sse(async (send) => {
      send({ model, choices: [{ delta: { content: "Mình tạo tệp cho bạn ngay." } }] })
      send({
        model,
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "call_1", function: { name: call.name, arguments: call.arguments.slice(0, 20) } },
              ],
            },
          },
        ],
      })
      send({
        model,
        choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: call.arguments.slice(20) } }] } }],
      })
      send({
        model,
        choices: [{ delta: {}, finish_reason: "tool_calls" }],
        usage: { prompt_tokens: 80, completion_tokens: 40, cost: 0.0001 },
      })
    })
  }
  const words = answer(text).split(/(?<=\s)/)
  return sse(async (send) => {
    for (const word of words) {
      send({ model, choices: [{ delta: { content: word } }] })
      await Bun.sleep(20)
    }
    send({
      model,
      choices: [{ delta: {}, finish_reason: "stop" }],
      usage: { prompt_tokens: 120, completion_tokens: words.length, cost: 0.0001 },
    })
  })
}

function answer(text: string) {
  const fence = "```"
  const short = `Chào bạn! Bạn vừa nói: **${text.slice(0, 40)}**\n\n${fence}ts\nconst x = 1\n${fence}\n\n- Gạch đầu dòng một\n- Gạch đầu dòng hai`
  if (!/dài|long/i.test(text)) return short
  const paragraph =
    "Đây là một đoạn văn dài để kiểm tra việc tự cuộn khi câu trả lời đang được viết ra. Kiwii viết từng chữ một, và khung chat phải bám theo dòng cuối trừ khi người dùng đã cuộn lên để đọc lại."
  return [short, ...Array.from({ length: 12 }, (_, i) => `### Phần ${i + 1}\n\n${paragraph}`)].join("\n\n")
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
