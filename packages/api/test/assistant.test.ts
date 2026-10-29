import { afterEach, describe, expect, mock, setSystemTime, spyOn, test } from "bun:test"
import { asc, eq } from "drizzle-orm"
import { checkAssistant, DAILY_MESSAGES, runAssistantTurn, type AssistantEvent } from "../src/assistant/turn"
import { createCharacter } from "../src/characters/store"
import { balance, grant } from "../src/credits/ledger"
import { files, generation_images, generations, project_messages, users } from "../src/db/schema"
import { createProject, ownProject } from "../src/projects/store"
import { testDatabase } from "./db"

const DAY = 24 * 60 * 60 * 1000
const PIXEL =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=="
const SETTINGS = { model: "flux-3-klein" as const, option: "1K", aspectRatio: "1:1", n: 1 }

afterEach(() => {
  mock.restore()
  setSystemTime()
})

type Script = Array<{ text?: string; calls?: Array<Record<string, unknown>> }>

// OpenRouter as the assistant sees it: each streamed chat call plays the next round of `script`,
// the screener allows anything without "BLOCKME" and fails on "NOVERDICT", and the image model draws
// one pixel.
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
      if (prompt.includes("NOVERDICT")) return new Response("upstream error", { status: 502 })
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
  const turn = async (text: string, settings: Partial<typeof SETTINGS> = {}, characterIDs: string[] = []) => {
    const events: AssistantEvent[] = []
    await runAssistantTurn({
      db,
      bucket,
      apiKey: "k",
      user,
      project: await ownProject(db, "u1", project.id),
      parallel: 4,
      request: { text, settings: { ...SETTINGS, ...settings }, referenceFileIDs: [], characterIDs },
      emit: (event) => {
        events.push(event)
      },
    })
    return events
  }
  // A character saved from one photo.
  const character = async (name: string) => {
    const id = `photo-${name}`
    await bucket.put(
      `u/u1/${id}.jpg`,
      Uint8Array.from(atob(PIXEL), (c) => c.charCodeAt(0)),
      {
        httpMetadata: { contentType: "image/jpeg" },
      },
    )
    await db.insert(files).values({
      id,
      user_id: "u1",
      r2_key: `u/u1/${id}.jpg`,
      name: `${id}.jpg`,
      mime: "image/jpeg",
      size: 1,
      kind: "reference",
    })
    return createCharacter(db, bucket, { userID: "u1", name, fileIDs: [id] })
  }
  return { db, user, project, turn, character }
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

  test("a video in the project is never offered as a picture to work from", async () => {
    const { db, project, turn } = await setup()
    const calls = openrouter([
      { calls: [{ prompt: "Ngọn hải đăng lúc bình minh" }] },
      { text: "Xong." },
      { calls: [{ prompt: "Ngọn hải đăng lúc hoàng hôn", reference_images: ["#1"] }] },
      { text: "Đã đổi sang hoàng hôn." },
    ])
    await turn("Ngọn hải đăng lúc bình minh")
    const picture = (await db.select().from(generation_images).get())!
    // A clip made since, in the same project: the newest run.
    await db.insert(generations).values({
      id: "zz-clip",
      user_id: "u1",
      kind: "video",
      status: "done",
      model: "wan-3.0",
      option: "720p",
      aspect_ratio: "16:9",
      n: 1,
      duration: 5,
      prompt_raw: "Sóng vỗ vào chân hải đăng",
      credits_reserved: 27,
      project_id: project.id,
    })
    await db.insert(files).values({
      id: "clip",
      user_id: "u1",
      r2_key: "u/u1/clip.mp4",
      name: "clip.mp4",
      mime: "video/mp4",
      size: 1,
      kind: "video",
      generation_id: "zz-clip",
    })
    await db
      .insert(generation_images)
      .values({ id: "clip", generation_id: "zz-clip", user_id: "u1", file_id: "clip", position: 0 })
    await turn("Đổi nền sang hoàng hôn")

    expect(String(calls.sent[2]!.messages[0]!.content)).not.toContain("Sóng vỗ")
    const edited = (await db
      .select()
      .from(generations)
      .where(eq(generations.prompt_raw, "Ngọn hải đăng lúc hoàng hôn"))
      .get())!
    expect(JSON.parse(edited.reference_file_ids)).toEqual([picture.file_id])
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
    const { db, turn } = await setup()
    const calls = openrouter([
      { calls: [{ prompt: "Một" }] },
      { calls: [{ prompt: "Hai" }] },
      // A call made anyway in the last round is not carried out.
      { text: "Đã xong cả hai.", calls: [{ prompt: "Ba" }] },
    ])
    await turn("Vẽ liên tục")
    expect(calls.sent.map((s) => Array.isArray(s.tools))).toEqual([true, true, false])
    expect((await db.select().from(generations)).map((g) => g.prompt_raw).sort()).toEqual(["Hai", "Một"])
  })

  test("a wrong picture label is answered with the labels there are", async () => {
    const { db, turn } = await setup()
    const calls = openrouter([
      { calls: [{ prompt: "Ngọn hải đăng" }] },
      { text: "Xong." },
      { calls: [{ prompt: "Ngọn hải đăng lúc hoàng hôn", reference_images: ["R1"] }] },
      { calls: [{ prompt: "Ngọn hải đăng lúc hoàng hôn", reference_images: ["#1"] }] },
      { text: "Đã đổi." },
    ])
    await turn("Vẽ ngọn hải đăng")
    await turn("Đổi sang hoàng hôn")
    const answer = calls.sent[3]!.messages.at(-1)
    expect(answer).toMatchObject({ role: "tool" })
    expect(JSON.parse(String(answer?.content))).toEqual({
      error: "Unknown picture label R1. Labels you can use: #1",
    })
    expect(await db.select().from(generations)).toHaveLength(2)
  })

  test("markup the model leaves around a prompt is removed", async () => {
    const { db, turn } = await setup()
    openrouter([{ calls: [{ prompt: "<parameter=prompt>Chú mèo cam</parameter>" }] }, { text: "Xong." }])
    await turn("Vẽ chú mèo cam")
    expect((await db.select().from(generations).get())?.prompt_raw).toBe("Chú mèo cam")
  })

  test("a frame the person names holds when the model only writes it into the prompt", async () => {
    const { db, turn } = await setup()
    openrouter([
      { calls: [{ prompt: "Logo quán trà, khổ dọc 9:16" }] },
      { text: "Xong." },
      { calls: [{ prompt: "Logo quán trà", aspect_ratio: "16:9" }] },
      { text: "Xong." },
    ])
    await turn("Làm bản dọc 9:16 để đăng story")
    // What the model asks for itself still wins.
    await turn("Thêm một bản 9:16 nữa")
    const runs = await db.select().from(generations).orderBy(asc(generations.id))
    expect(runs.map((run) => run.aspect_ratio)).toEqual(["9:16", "16:9"])
  })

  test("a picked character is in every run of the reply, and the model may add a saved one by label", async () => {
    const { db, turn, character } = await setup()
    const lan = await character("Lan")
    const minh = await character("Minh")
    const calls = openrouter([
      { calls: [{ prompt: "Lan ở bãi biển" }, { prompt: "Lan và Minh ở bãi biển", characters: ["C2"] }] },
      { text: "Xong." },
    ])
    await turn("Vẽ Lan ở bãi biển, thêm một ảnh có cả Minh", {}, [lan.id])

    const runs = await db.select().from(generations).orderBy(asc(generations.id))
    expect(runs.map((run) => JSON.parse(run.character_ids))).toEqual([[lan.id], [lan.id, minh.id]])
    const system = String(calls.sent[0]!.messages[0]!.content)
    expect(system).toContain('Saved characters: C1 "Lan", C2 "Minh".')
    expect(system).toContain("The person picked C1 for this message")
    const asked = (await db.select().from(project_messages).orderBy(asc(project_messages.created_at)).get())!
    expect(JSON.parse(asked.parts)).toContainEqual({ type: "character", id: lan.id, name: "Lan" })
  })

  test("an unknown character is refused with the labels the model can use", async () => {
    const { db, turn, character } = await setup()
    await character("Lan")
    const calls = openrouter([{ calls: [{ prompt: "Hùng", characters: ["C7"] }] }, { text: "Không có nhân vật đó." }])
    await turn("Vẽ Hùng")
    expect(await db.select().from(generations)).toHaveLength(0)
    expect(calls.sent[1]!.messages.at(-1)).toMatchObject({
      role: "tool",
      content: JSON.stringify({ error: "Unknown character. Characters you can use: C1" }),
    })
  })

  test("a prompt no model could screen starts no run and costs nothing", async () => {
    const { db, turn } = await setup()
    openrouter([{ calls: [{ prompt: "NOVERDICT con mèo" }] }, { text: "Chưa tạo được, bạn thử lại nhé." }])
    const events = await turn("Vẽ con mèo")
    expect(events).toContainEqual(expect.objectContaining({ type: "notice", code: "SCREENING_UNAVAILABLE" }))
    expect(await db.select().from(generations)).toHaveLength(0)
    expect(await balance(db, "u1")).toBe(100)
  })

  test("a message left unanswered is not carried out with the next one", async () => {
    const { turn } = await setup()
    // Both messages are stored within the same millisecond, as they are on a fast machine.
    setSystemTime(new Date())
    // The first turn gets nothing back from the model, so it fails without a reply.
    const calls = openrouter([{}, { calls: [{ prompt: "Chiếc thuyền buồm" }] }, { text: "Xong." }])
    const failed = await turn("Vẽ con mèo")
    expect(failed.at(-1)).toMatchObject({ type: "error" })
    await turn("Vẽ chiếc thuyền buồm")
    const history = calls.sent[1]!.messages
    expect(history.map((m) => m.role)).toEqual(["system", "user"])
    expect(history[1]?.content).toBe("Vẽ chiếc thuyền buồm")
  })
})

describe("checkAssistant", () => {
  const request = { text: "Vẽ mèo", settings: SETTINGS, referenceFileIDs: [], characterIDs: [] }

  test("a free account without credits is asked to upgrade", async () => {
    const { db, user } = await setup("free", 0)
    const error = await checkAssistant(db, user, request).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ status: 403, code: "IMAGE_REQUIRES_PAID" })
  })

  test("trial credits work with FLUX only, and not past a run's price", async () => {
    const { db, user } = await setup("free", 1)
    const other = { ...request, settings: { ...SETTINGS, model: "gpt-image-2.5" as const, option: "medium" } }
    expect(await checkAssistant(db, user, other).catch((reason: unknown) => reason)).toMatchObject({ status: 403 })
    const sharper = { ...request, settings: { ...SETTINGS, option: "2K" } }
    expect(await checkAssistant(db, user, sharper).catch((reason: unknown) => reason)).toMatchObject({ status: 403 })
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
