import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { checkAssistant, DAILY_MESSAGES, runAssistantTurn, type AssistantEvent } from "../src/assistant/turn"
import { balance, grant } from "../src/credits/ledger"
import { generations, project_messages, users } from "../src/db/schema"
import { createProject, ownProject } from "../src/projects/store"
import { testDatabase } from "./db"

const DAY = 24 * 60 * 60 * 1000
const PIXEL =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=="
const SETTINGS = { model: "flux-3-klein" as const, option: "1K", aspectRatio: "1:1", n: 1 }

afterEach(() => mock.restore())

type Script = Array<{ text?: string; calls?: Array<Record<string, unknown>> }>

// OpenRouter as the assistant sees it: each streamed chat call plays the next round of `script`,
// the screener allows anything without "BLOCKME", and the image model draws one pixel.
function openrouter(script: Script) {
  const sent: Array<{
    messages: Array<{ role: string; content: unknown; tool_calls?: Array<{ function: { arguments: string } }> }>
    tools?: unknown[]
  }> = []
  const images: Array<Record<string, unknown>> = []
  const spy = spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    if (String(url).endsWith("/images")) {
      images.push(body)
      return Response.json({ data: [{ b64_json: PIXEL, media_type: "image/jpeg" }], usage: { cost: 0.01 } })
    }
    if (!body.stream) {
      const prompt = String((body.messages as Array<{ content: string }>).at(-1)?.content)
      const allowed = !prompt.includes("BLOCKME")
      const content = JSON.stringify({
        allowed,
        reason: allowed ? "" : "Không phù hợp",
        prompt: `Rewritten: ${prompt}`,
      })
      return Response.json({ choices: [{ message: { content } }], usage: { cost: 0.0001 } })
    }
    sent.push(body as (typeof sent)[number])
    const round = script[sent.length - 1] ?? { text: "Xong." }
    const chunks = [
      ...(round.text ? [{ choices: [{ delta: { content: round.text } }] }] : []),
      ...(round.calls ?? []).map((args, index) => ({
        choices: [
          {
            delta: {
              tool_calls: [
                { index, id: `call_${index}`, function: { name: "generate_image", arguments: JSON.stringify(args) } },
              ],
            },
          },
        ],
      })),
      {
        model: "mock/assistant",
        choices: [{ delta: {}, finish_reason: round.calls ? "tool_calls" : "stop" }],
        usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.0002 },
      },
    ]
    const stream = [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}`), "data: [DONE]", ""].join("\n\n")
    return new Response(stream, { headers: { "content-type": "text/event-stream" } })
  })
  return { spy, sent, images }
}

function fakeBucket() {
  const store = new Map<string, { bytes: Uint8Array; mime: string }>()
  return {
    async put(key: string, value: Uint8Array | ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) {
      store.set(key, { bytes: new Uint8Array(value as ArrayBuffer), mime: options?.httpMetadata?.contentType ?? "" })
    },
    async get(key: string) {
      const item = store.get(key)
      if (!item) return null
      return { httpMetadata: { contentType: item.mime }, arrayBuffer: async () => item.bytes.buffer }
    },
  } as unknown as R2Bucket
}

async function setup(tier: "plus" | "free" = "plus", credits = 100) {
  const db = await testDatabase()
  await db.insert(users).values({
    id: "u1",
    email: "u1@x",
    password_hash: "h",
    password_salt: "s",
    password_iterations: 1,
    tier,
    tier_until: tier === "free" ? null : Date.now() + 30 * DAY,
  })
  if (credits)
    await grant(db, { userID: "u1", source: "plan", amount: credits, expiresAt: Date.now() + DAY, reason: "p" })
  const user = (await db.select().from(users).where(eq(users.id, "u1")).get())!
  const project = await createProject(db, { userID: "u1", name: "" })
  const bucket = fakeBucket()
  const turn = async (text: string, settings: Partial<typeof SETTINGS> = {}) => {
    const events: AssistantEvent[] = []
    await runAssistantTurn({
      db,
      bucket,
      apiKey: "k",
      user,
      project: await ownProject(db, "u1", project.id),
      parallel: 4,
      request: { text, settings: { ...SETTINGS, ...settings }, referenceFileIDs: [] },
      emit: (event) => {
        events.push(event)
      },
    })
    return events
  }
  return { db, user, project, turn }
}

describe("runAssistantTurn", () => {
  test("a message starts a run in its project and the reply is kept with it", async () => {
    const { db, project, turn } = await setup()
    openrouter([{ text: "Mình tạo ngay.", calls: [{ prompt: "Chú mèo cam trên bậu cửa sổ" }] }, { text: "Xong rồi!" }])
    const events = await turn("Vẽ chú mèo cam trên bậu cửa sổ")

    // The picture renders while the model writes, so their events interleave; the turn ends last.
    const types = events.map((e) => e.type)
    expect(types[0]).toBe("start")
    expect(types.at(-1)).toBe("finish")
    expect(types.indexOf("generation-start")).toBeLessThan(types.indexOf("generation-done"))
    expect(new Set(types)).toEqual(
      new Set(["start", "text-delta", "generation-start", "generation-image", "generation-done", "finish"]),
    )
    const run = (await db.select().from(generations).get())!
    expect(run).toMatchObject({
      project_id: project.id,
      prompt_raw: "Chú mèo cam trên bậu cửa sổ",
      status: "done",
      n: 1,
    })
    expect(await balance(db, "u1")).toBe(99)
    // The project takes its name from the person's words.
    expect((await ownProject(db, "u1", project.id)).name).toBe("Vẽ chú mèo cam trên bậu cửa sổ")

    const turns = await db.select().from(project_messages).orderBy(asc(project_messages.created_at))
    expect(turns.map((t) => t.role)).toEqual(["user", "assistant"])
    expect(JSON.parse(turns[1]!.parts)).toEqual([
      { type: "text", text: "Mình tạo ngay. Xong rồi!" },
      { type: "generation", id: run.id },
    ])
    // Two model rounds at 0.0002 each; the run's own screening and picture are on the run.
    expect(turns[1]!.cost_usd).toBeCloseTo(0.0004)
    expect(turns[1]!.input_tokens).toBe(200)
  })

  test("working from an earlier picture sends it as a reference, and the model sees the labels", async () => {
    const { db, turn } = await setup()
    const calls = openrouter([
      { calls: [{ prompt: "Ngọn hải đăng lúc bình minh" }] },
      { text: "Xong." },
      { calls: [{ prompt: "Ngọn hải đăng lúc hoàng hôn", reference_images: ["#1"] }] },
      { text: "Đã đổi sang hoàng hôn." },
    ])
    await turn("Ngọn hải đăng lúc bình minh")
    const first = (await db.select().from(generations).get())!
    await turn("Đổi nền sang hoàng hôn")

    const runs = await db.select().from(generations).orderBy(asc(generations.id))
    expect(runs.map((r) => r.id)).toEqual([first.id, expect.any(String)])
    expect(JSON.parse(runs[0]!.reference_file_ids)).toEqual([])
    expect(JSON.parse(runs[1]!.reference_file_ids)).toHaveLength(1)
    // The third model call (the second message) lists the picture as #1 and replays the history,
    // the first run as the generate_image call that started it: shown as words, the model wrote
    // pictures into its replies instead of calling the tool.
    const history = calls.sent[2]!.messages
    expect(String(history[0]!.content)).toContain('#1: from "Ngọn hải đăng lúc bình minh"')
    expect(history.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool", "assistant", "user"])
    const call = { id: `call_${first.id}`, type: "function", function: { name: "generate_image" } }
    expect(history[2]).toMatchObject({ content: null, tool_calls: [call] })
    const args = history[2]?.tool_calls?.[0]?.function.arguments
    expect(JSON.parse(args ?? "")).toEqual({ prompt: "Ngọn hải đăng lúc bình minh" })
    expect(history[3]).toMatchObject({
      tool_call_id: call.id,
      content: JSON.stringify({ status: "started", pictures: 1 }),
    })
    expect(history[4]).toMatchObject({ content: "Xong." })
    expect(JSON.stringify(history)).not.toContain("made pictures")
    expect(calls.images.at(-1)?.input_references).toHaveLength(1)
  })

  test("a refused prompt becomes a notice and costs nothing", async () => {
    const { db, turn } = await setup()
    openrouter([{ calls: [{ prompt: "BLOCKME" }] }, { text: "Mình không tạo được ảnh này." }])
    const events = await turn("Vẽ BLOCKME")
    expect(events.find((e) => e.type === "notice")).toMatchObject({ code: "PROMPT_BLOCKED" })
    expect(await db.select().from(generations)).toHaveLength(0)
    expect(await balance(db, "u1")).toBe(100)
    const reply = (await db.select().from(project_messages).where(eq(project_messages.role, "assistant")).get())!
    expect(JSON.parse(reply.parts)).toEqual([
      { type: "text", text: "Mình không tạo được ảnh này." },
      { type: "notice", code: "PROMPT_BLOCKED", message: "Không phù hợp" },
    ])
  })

  test("a message never starts more than four pictures", async () => {
    const { db, turn } = await setup()
    openrouter([
      {
        calls: [
          { prompt: "Phương án một", count: 3 },
          { prompt: "Phương án hai", count: 3 },
        ],
      },
      { text: "Xong." },
    ])
    await turn("Hai phương án logo quán cà phê")
    const runs = await db.select().from(generations).orderBy(asc(generations.id))
    expect(runs.map((r) => r.n)).toEqual([3, 1])
  })

  test("the last round offers no tool, so the assistant ends with words", async () => {
    const { turn } = await setup()
    const calls = openrouter([
      { calls: [{ prompt: "Một" }] },
      { calls: [{ prompt: "Hai" }] },
      { text: "Đã xong cả hai." },
    ])
    await turn("Vẽ liên tục")
    expect(calls.sent.map((s) => Array.isArray(s.tools))).toEqual([true, true, false])
  })
})

describe("checkAssistant", () => {
  const request = { text: "Vẽ mèo", settings: SETTINGS, referenceFileIDs: [] }

  test("a free account without credits is asked to upgrade", async () => {
    const { db, user } = await setup("free", 0)
    const error = await checkAssistant(db, user, request).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ status: 403, code: "IMAGE_REQUIRES_PAID" })
  })

  test("trial credits work with FLUX only, and not past a run's price", async () => {
    const { db, user } = await setup("free", 1)
    const other = { ...request, settings: { ...SETTINGS, model: "gpt-image-2.5" as const, option: "medium" } }
    expect(await checkAssistant(db, user, other).catch((reason: unknown) => reason)).toMatchObject({ status: 403 })
    const four = { ...request, settings: { ...SETTINGS, n: 4 } }
    expect(await checkAssistant(db, user, four).catch((reason: unknown) => reason)).toMatchObject({
      status: 402,
      code: "INSUFFICIENT_CREDITS",
    })
    expect(await checkAssistant(db, user, request)).toMatchObject({ trial: true, parallelLimit: 1 })
  })

  test("a trial account sends a limited number of messages a day", async () => {
    const { db, user } = await setup("free", 5)
    for (const _ of Array.from({ length: DAILY_MESSAGES.trial })) await checkAssistant(db, user, request)
    const error = await checkAssistant(db, user, request).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ status: 429, code: "ASSISTANT_LIMIT" })
  })
})
