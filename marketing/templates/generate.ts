// Makes one example for each template on /templates by running the template itself on production,
// with the words below in its slots. PAID: every run spends OpenRouter credit from the account whose
// session is in AMBERPIX_SESSION. Ask the owner before running (see CLAUDE.md, "Paid runs").
//
//   AMBERPIX_SESSION=<cookie value> bun marketing/templates/generate.ts [--only id,id] [--kind image|video]
//
// Originals land in marketing/out/templates/<id>.<ext>; a run already there is skipped.
import { mkdirSync } from "node:fs"
import { fillTemplate, TEMPLATES } from "../../packages/web/src/templates"

const BASE = process.env.AMBERPIX_URL ?? "https://amberpix.com"
const cookie = `kiwii_session=${process.env.AMBERPIX_SESSION ?? ""}`
const out = new URL("../out/templates/", import.meta.url)
mkdirSync(out, { recursive: true })

// What a seller would type into each template.
const WORDS: Record<string, Record<string, string>> = {
  "white-background": { product: "chai serum thuỷ tinh trong suốt nắp vàng 30ml" },
  lifestyle: { product: "hũ nến thơm thuỷ tinh màu hổ phách", scene: "bàn gỗ cạnh cửa sổ buổi sáng" },
  "flat-lay": { product: "bộ ba thỏi son vỏ đen nhám", props: "cánh hoa hồng khô và khăn linen" },
  food: { dish: "tô bún bò Huế đầy đủ topping" },
  "sale-poster": { product: "ly trà sữa trân châu", headline: "MUA 1 TẶNG 1", detail: "Chỉ cuối tuần này" },
  banner: { subject: "bộ sưu tập áo dài Tết", headline: "Đón Tết rực rỡ" },
  tet: { greeting: "Chúc Mừng Năm Mới", brand: "Tiệm Bánh Nhà Mây" },
  headshot: { outfit: "vest xanh navy, sơ mi trắng" },
  lookbook: { item: "đầm lụa xanh ngọc dáng dài", place: "con phố cổ Hội An lúc chiều" },
  thumbnail: { topic: "review 5 quán phở ngon nhất Hà Nội", headline: "PHỞ NGON NHẤT?" },
  quote: { quote: "Mỗi ngày một chút, rồi sẽ tới", mood: "đồi chè buổi sớm có sương" },
  "product-spin": { product: "chai nước hoa thuỷ tinh màu hổ phách" },
  "food-steam": { dish: "nồi lẩu thái sôi sùng sục" },
  "model-walk": { item: "áo dài trắng thêu hoa sen", place: "hành lang nắng của một ngôi nhà cổ" },
}
// The setting each image model is run at, and the clip model with its cheapest setting.
const OPTION: Record<string, string> = { "nano-banana-2.1": "2K", "gpt-image-2.5": "high", "flux-3-klein": "2K" }
const CLIP = { model: "wan-3.0", option: "720p", duration: 5 }

const arg = (name: string) => {
  const at = process.argv.indexOf(name)
  return at < 0 ? undefined : process.argv[at + 1]
}
const only = arg("--only")?.split(",")
const kind = arg("--kind")
const chosen = TEMPLATES.filter((t) => (!only || only.includes(t.id)) && (!kind || t.kind === kind))

const headers = { cookie, "content-type": "application/json" }
const save = async (id: string, fileID: string, ext: string) => {
  const res = await fetch(`${BASE}/api/images/files/${fileID}`, { headers: { cookie } })
  if (!res.ok) throw new Error(`file ${fileID}: HTTP ${res.status}`)
  const type = res.headers.get("content-type") ?? ""
  const name = `${id}.${ext === "mp4" ? "mp4" : type.includes("png") ? "png" : type.includes("webp") ? "webp" : "jpg"}`
  await Bun.write(new URL(name, out), await res.arrayBuffer())
  return name
}
const done = async (id: string) =>
  (await Array.fromAsync(new Bun.Glob(`${id}.*`).scan({ cwd: out.pathname }))).length > 0

async function image(template: (typeof TEMPLATES)[number]) {
  const model = template.model ?? "nano-banana-2.1"
  const res = await fetch(`${BASE}/api/images/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      option: OPTION[model],
      aspectRatio: template.aspectRatio,
      n: 1,
      prompt: fillTemplate(template, WORDS[template.id] ?? {}),
    }),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status} ${text.slice(0, 200)}`)
  const frames = text.split("\n\n").map((frame) => ({
    event: /^event: (.*)$/m.exec(frame)?.[1],
    data: /^data: (.*)$/m.exec(frame)?.[1],
  }))
  const failed = frames.find((frame) => frame.event === "error")
  if (failed) throw new Error(failed.data ?? "failed")
  const made = frames.find((frame) => frame.event === "image")
  const ended = frames.find((frame) => frame.event === "done")
  if (!made?.data) throw new Error("no picture in the answer")
  const name = await save(template.id, (JSON.parse(made.data) as { fileID: string }).fileID, "img")
  return `${name} ${ended?.data ?? ""}`
}

async function clip(template: (typeof TEMPLATES)[number]) {
  const res = await fetch(`${BASE}/api/videos/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      ...CLIP,
      aspectRatio: template.aspectRatio,
      prompt: fillTemplate(template, WORDS[template.id] ?? {}),
    }),
  })
  const started = (await res.json()) as { id?: string; error?: { message: string } }
  if (!res.ok || !started.id) throw new Error(`HTTP ${res.status} ${started.error?.message ?? ""}`)
  for (let look = 0; look < 140; look++) {
    await Bun.sleep(15_000)
    const run = (await (await fetch(`${BASE}/api/images/generations/${started.id}`, { headers: { cookie } })).json()) as {
      status: string
      error?: string
      creditsFinal?: number
      images: Array<{ fileID: string }>
    }
    if (run.status === "failed") throw new Error(run.error ?? "failed")
    if (run.status === "done" && run.images[0]) {
      return `${await save(template.id, run.images[0].fileID, "mp4")} credits=${run.creditsFinal}`
    }
  }
  throw new Error(`still running: ${started.id}`)
}

// Four at a time: well inside the plan's parallel limit.
for (let at = 0; at < chosen.length; at += 4) {
  await Promise.all(
    chosen.slice(at, at + 4).map(async (template) => {
      if (await done(template.id)) return console.log(`${template.id}: kept`)
      const result = await (template.kind === "video" ? clip(template) : image(template)).catch(
        (error: unknown) => `FAILED ${error instanceof Error ? error.message : String(error)}`,
      )
      console.log(`${template.id}: ${result}`)
    }),
  )
}
