import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import { eq } from "drizzle-orm"
import { createCharacter } from "../src/characters/store"
import { balance, grant } from "../src/credits/ledger"
import { app_config, credit_ledger, files, generation_images, generations, users } from "../src/db/schema"
import { enhancePrompt } from "../src/images/enhance"
import { reapStaleGenerations } from "../src/images/generate"
import { CreateGeneration, prepareGeneration } from "../src/images/prepare"
import { byteSpan } from "../src/images/r2"
import { loadVideoModels, videoCreditCost, VIDEO_MODELS } from "../src/videos/models"
import { CreateVideo, prepareVideo } from "../src/videos/prepare"
import { checkVideo, giveUpVideo, startVideo, type VideoParams } from "../src/videos/run"
import { testDatabase } from "./db"

const DAY = 24 * 60 * 60 * 1000
const CLIP = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112])

afterEach(() => mock.restore())

function fakeBucket() {
  const store = new Map<string, { bytes: Uint8Array; mime: string }>()
  const bucket = {
    async put(key: string, value: Uint8Array | ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) {
      store.set(key, { bytes: new Uint8Array(value), mime: options?.httpMetadata?.contentType ?? "" })
    },
    async get(key: string) {
      const item = store.get(key)
      if (!item) return null
      return {
        httpMetadata: { contentType: item.mime },
        arrayBuffer: async () => item.bytes.slice().buffer,
        body: new Blob([item.bytes]).stream(),
      }
    },
    async delete(key: string) {
      store.delete(key)
    },
  } as unknown as R2Bucket
  return { store, bucket }
}

async function setup(tier: "plus" | "free" = "plus") {
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
  await grant(db, { userID: "u1", source: "plan", amount: 100, expiresAt: Date.now() + DAY, reason: "p" })
  const user = (await db.select().from(users).where(eq(users.id, "u1")).get())!
  const { store, bucket } = fakeBucket()
  return { db, user, store, bucket }
}

const urlOf = (input: string | URL | Request) => (input instanceof Request ? input.url : input.toString())

// OpenRouter stand-in: the screening allows everything, and the video job is in `job`'s state.
function openRouter(job: { status: string; error?: string; cost?: number } = { status: "in_progress" }) {
  const asked: Array<{ url: string; body: unknown }> = []
  spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = urlOf(input)
    asked.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined })
    if (url.endsWith("/chat/completions")) {
      const content = JSON.stringify({ allowed: true, reason: "", prompt: "A paper boat drifts on a pond." })
      return Response.json({ choices: [{ message: { content } }], usage: { cost: 0.0002 } })
    }
    if (url.endsWith("/videos")) return Response.json({ id: "job1", status: "pending" }, { status: 202 })
    if (url.endsWith("/content?index=0")) return new Response(CLIP)
    return Response.json({ id: "job1", status: job.status, error: job.error, usage: { cost: job.cost ?? 0 } })
  })
  return asked
}

const request = (extra: Record<string, unknown> = {}) =>
  CreateVideo.parse({
    model: "wan-3.0",
    option: "720p",
    aspectRatio: "16:9",
    duration: 5,
    prompt: "Thuyền giấy trôi trên mặt hồ",
    ...extra,
  })

describe("video prices", () => {
  test("a clip costs credits by model, resolution and length, and app_config can change one", async () => {
    expect(videoCreditCost(VIDEO_MODELS, { model: "wan-3.0", option: "720p", duration: 5 })).toBe(27)
    expect(videoCreditCost(VIDEO_MODELS, { model: "wan-3.0", option: "1080p", duration: 10 })).toBe(105)
    expect(videoCreditCost(VIDEO_MODELS, { model: "minimax-h3", option: "2K", duration: 5 })).toBe(34)
    expect(videoCreditCost(VIDEO_MODELS, { model: "seedance-2.5", option: "720p", duration: 10 })).toBe(122)
    expect(videoCreditCost(VIDEO_MODELS, { model: "wan-3.0", option: "720p", duration: 7 })).toBeUndefined()
    expect(videoCreditCost(VIDEO_MODELS, { model: "minimax-h3", option: "1080p", duration: 5 })).toBeUndefined()
    // No model bills the one picture a clip starts from (MiniMax's first five are free); a model that
    // did would add its surcharge.
    expect(videoCreditCost(VIDEO_MODELS, { model: "minimax-h3", option: "2K", duration: 5, firstFrame: true })).toBe(34)
    const billed = VIDEO_MODELS.map((m) => (m.id === "wan-3.0" ? { ...m, firstFrameCredits: 2 } : m))
    expect(videoCreditCost(billed, { model: "wan-3.0", option: "720p", duration: 5, firstFrame: true })).toBe(29)

    const db = await testDatabase()
    await db.insert(app_config).values({ key: "video_models", value: '{"wan-3.0":{"720p":{"5":30}}}', updated_at: 0 })
    const models = await loadVideoModels(db)
    expect(videoCreditCost(models, { model: "wan-3.0", option: "720p", duration: 5 })).toBe(30)
    expect(videoCreditCost(models, { model: "wan-3.0", option: "720p", duration: 10 })).toBe(53)
  })
})

describe("prepareVideo", () => {
  test("only paid plans make videos", async () => {
    const { db, user, bucket } = await setup("free")
    openRouter()
    const error = await prepareVideo({ db, bucket, apiKey: "k", user, request: request() }).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 403, code: "VIDEO_REQUIRES_PAID" })
  })

  test("the clip is screened and rewritten as a clip, its price held, and one video run stored", async () => {
    const { db, user, bucket } = await setup()
    const asked = openRouter()
    const { generation, firstFrame } = await prepareVideo({ db, bucket, apiKey: "k", user, request: request() })

    const system = JSON.stringify(asked[0]!.body)
    expect(system).toContain("AI video generator")
    expect(system).toContain("a 5-second video clip")
    expect(system).toContain("The clip has sound")
    expect(generation).toMatchObject({
      kind: "video",
      status: "running",
      model: "wan-3.0",
      option: "720p",
      duration: 5,
      n: 1,
      credits_reserved: 27,
      prompt_enhanced: "A paper boat drifts on a pond.",
    })
    expect(firstFrame).toBeUndefined()
    expect(await balance(db, "u1")).toBe(73)
  })

  test("a picture becomes the first frame at its surcharge, and a length the model does not make is refused", async () => {
    const { db, user, bucket } = await setup()
    await bucket.put("u/u1/p.jpg", new TextEncoder().encode("p").buffer, {
      httpMetadata: { contentType: "image/jpeg" },
    })
    await db.insert(files).values({
      id: "p",
      user_id: "u1",
      r2_key: "u/u1/p.jpg",
      name: "p.jpg",
      mime: "image/jpeg",
      size: 1,
      kind: "reference",
    })
    const asked = openRouter()
    const { generation, firstFrame } = await prepareVideo({
      db,
      bucket,
      apiKey: "k",
      user,
      request: request({ model: "minimax-h3", option: "2K", referenceFileIDs: ["p"] }),
    })
    expect(firstFrame).toBe(`data:image/jpeg;base64,${btoa("p")}`)
    expect(generation).toMatchObject({ reference_file_ids: JSON.stringify(["p"]), credits_reserved: 34 })
    expect(JSON.stringify(asked[0]!.body)).toContain("The clip starts from the picture they attached")

    const error = await prepareVideo({ db, bucket, apiKey: "k", user, request: request({ duration: 7 }) }).catch(
      (e: unknown) => e,
    )
    expect(error).toMatchObject({ status: 400, code: "INVALID_OPTION" })
  })
})

test("a clip from a silent model names no sounds", async () => {
  const asked = openRouter()
  await enhancePrompt({
    apiKey: "k",
    model: "wan-3.0",
    clip: { seconds: 10, sound: false },
    prompt: "Thuyền giấy trôi trên mặt hồ",
    rewrite: true,
    aspectRatio: "9:16",
    references: 0,
  })
  const system = JSON.stringify(asked[0]!.body)
  expect(system).toContain("a 10-second video clip")
  expect(system).not.toContain("The clip has sound")
})

describe("a video run", () => {
  // Cloudflare Workflows stand-in: keeps the instances it was asked for, or refuses with `failure`.
  function fakeWorkflow(failure?: string) {
    const created: Array<{ id?: string; params?: VideoParams }> = []
    const workflow = {
      get: async () => {
        throw new Error("unused")
      },
      create: async (options?: { id?: string; params?: VideoParams }) => {
        if (failure) throw new Error(failure)
        created.push(options ?? {})
        return { id: options?.id ?? "" }
      },
      createBatch: async () => [],
    } as unknown as Workflow<VideoParams>
    return { created, workflow }
  }

  async function started(job: Parameters<typeof openRouter>[0] = { status: "in_progress" }) {
    const context = await setup()
    const asked = openRouter(job)
    const { created, workflow } = fakeWorkflow()
    const prepared = await prepareVideo({ ...context, apiKey: "k", request: request() })
    const generation = await startVideo({ db: context.db, apiKey: "k", ...prepared, workflow })
    return { ...context, asked, created, generation, job }
  }

  test("is submitted with its rewritten prompt and settings, and a workflow waits on it", async () => {
    const { asked, created, generation, db } = await started()
    const submitted = asked.find((call) => call.url.endsWith("/videos"))!.body
    expect(submitted).toMatchObject({
      model: "alibaba/wan-3.0",
      prompt: "A paper boat drifts on a pond.",
      duration: 5,
      resolution: "720p",
      aspect_ratio: "16:9",
      generate_audio: true,
    })
    expect(created).toEqual([{ id: generation.id, params: { generationID: generation.id } }])
    expect((await db.select().from(generations).get())!.job_id).toBe("job1")
  })

  test("a job still in progress, or in a state not known yet, leaves the run waiting", async () => {
    const { db, bucket, generation, job } = await started()
    expect(await checkVideo({ db, bucket, apiKey: "k", generationID: generation.id })).toBe("running")
    job.status = "queued"
    expect(await checkVideo({ db, bucket, apiKey: "k", generationID: generation.id })).toBe("running")
    expect((await db.select().from(generations).get())!.status).toBe("running")
    expect(await balance(db, "u1")).toBe(73)
  })

  test("a finished job is stored as the run's clip and charged at its price", async () => {
    const { db, bucket, store, generation } = await started({ status: "completed", cost: 0.5 })
    expect(await checkVideo({ db, bucket, apiKey: "k", generationID: generation.id })).toBe("done")

    const row = (await db.select().from(generations).get())!
    expect(row).toMatchObject({ status: "done", credits_final: 27, error: null })
    expect(row.cost_usd).toBeCloseTo(0.5002)
    const file = (await db.select().from(files).get())!
    expect(file).toMatchObject({
      kind: "video",
      mime: "video/mp4",
      size: CLIP.byteLength,
      generation_id: generation.id,
    })
    expect(store.get(file.r2_key)?.bytes).toEqual(CLIP)
    expect(await db.select().from(generation_images).where(eq(generation_images.file_id, file.id))).toHaveLength(1)
    expect(await balance(db, "u1")).toBe(73)
    // A second look changes nothing.
    expect(await checkVideo({ db, bucket, apiKey: "k", generationID: generation.id })).toBe("done")
    expect(await db.select().from(files)).toHaveLength(1)
  })

  test("a look retried after it stored the clip keeps one clip", async () => {
    const { db, bucket, store, generation } = await started({ status: "completed", cost: 0.5 })
    // What a look that failed after storing the clip, before marking the run done, left behind.
    const key = `u/u1/${generation.id}.mp4`
    await db.insert(files).values({
      id: generation.id,
      user_id: "u1",
      r2_key: key,
      name: "clip.mp4",
      mime: "video/mp4",
      size: CLIP.byteLength,
      kind: "video",
      generation_id: generation.id,
    })
    await db
      .insert(generation_images)
      .values({ id: generation.id, generation_id: generation.id, user_id: "u1", file_id: generation.id, position: 0 })
    expect(await checkVideo({ db, bucket, apiKey: "k", generationID: generation.id })).toBe("done")
    expect(await db.select().from(files)).toHaveLength(1)
    expect(await db.select().from(generation_images)).toHaveLength(1)
    expect([...store.keys()]).toEqual([key])
  })

  test("a failed job fails the run and gives the credits back", async () => {
    const { db, bucket, generation } = await started({ status: "failed", error: "content moderation" })
    expect(await checkVideo({ db, bucket, apiKey: "k", generationID: generation.id })).toBe("failed")
    expect((await db.select().from(generations).get())!).toMatchObject({
      status: "failed",
      error: "content moderation",
      credits_final: 0,
    })
    expect(await balance(db, "u1")).toBe(100)
  })

  test("the workflow giving up fails and refunds the run once", async () => {
    const { db, generation } = await started()
    expect(await giveUpVideo(db, generation.id)).toBe("failed")
    expect(await giveUpVideo(db, generation.id)).toBe("failed")
    expect((await db.select().from(generations).get())!.error).toBe("timeout")
    const refunds = await db.select().from(credit_ledger).where(eq(credit_ledger.type, "refund"))
    expect(refunds).toHaveLength(1)
    expect(await balance(db, "u1")).toBe(100)
  })

  test("a job the provider refuses fails at once, refunded", async () => {
    const context = await setup()
    openRouter()
    spyOn(globalThis, "fetch").mockImplementation(async (input) =>
      urlOf(input).endsWith("/chat/completions")
        ? Response.json({
            choices: [{ message: { content: JSON.stringify({ allowed: true, reason: "", prompt: "A boat" }) } }],
          })
        : Response.json({ error: { message: "duration must be one of 5, 10" } }, { status: 400 }),
    )
    const prepared = await prepareVideo({ ...context, apiKey: "k", request: request() })
    const error = await startVideo({ db: context.db, apiKey: "k", ...prepared }).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 502, code: "VIDEO_FAILED" })
    expect((await context.db.select().from(generations).get())!).toMatchObject({ status: "failed", credits_final: 0 })
    expect(await balance(context.db, "u1")).toBe(100)
  })

  test("a job nobody could watch fails at once, refunded", async () => {
    const context = await setup()
    openRouter()
    const { workflow } = fakeWorkflow("binding gone")
    const prepared = await prepareVideo({ ...context, apiKey: "k", request: request() })
    const error = await startVideo({ db: context.db, apiKey: "k", ...prepared, workflow }).catch((e: unknown) => e)
    expect(error).toMatchObject({ status: 502, code: "VIDEO_FAILED" })
    expect((await context.db.select().from(generations).get())!).toMatchObject({
      status: "failed",
      error: "workflow: binding gone",
      job_id: "job1",
    })
    expect(await balance(context.db, "u1")).toBe(100)
  })
})

describe("a clip is never used as a picture", () => {
  test("as a reference, a first frame or a character's photo", async () => {
    const { db, user, bucket } = await setup()
    await bucket.put("u/u1/clip.mp4", CLIP, { httpMetadata: { contentType: "video/mp4" } })
    await db.insert(files).values({
      id: "clip",
      user_id: "u1",
      r2_key: "u/u1/clip.mp4",
      name: "clip.mp4",
      mime: "video/mp4",
      size: CLIP.byteLength,
      kind: "video",
    })
    openRouter()
    const reference = CreateGeneration.parse({
      model: "nano-banana-2.1",
      option: "1K",
      aspectRatio: "1:1",
      prompt: "Một chiếc thuyền",
      referenceFileIDs: ["clip"],
    })
    expect(
      await prepareGeneration({ db, bucket, apiKey: "k", user, request: reference }).catch((e: unknown) => e),
    ).toMatchObject({
      status: 404,
      code: "FILE_NOT_FOUND",
    })
    const frame = request({ referenceFileIDs: ["clip"] })
    expect(
      await prepareVideo({ db, bucket, apiKey: "k", user, request: frame }).catch((e: unknown) => e),
    ).toMatchObject({
      status: 404,
      code: "FILE_NOT_FOUND",
    })
    const character = await createCharacter(db, bucket, { userID: "u1", name: "Lan", fileIDs: ["clip"] }).catch(
      (e: unknown) => e,
    )
    expect(character).toMatchObject({ status: 400, code: "NOT_A_PICTURE" })
    expect(await balance(db, "u1")).toBe(100)
  })
})

describe("the stale-run reaper", () => {
  test("leaves a video that is still within its hour, and reaps a picture run past ten minutes", async () => {
    const { db } = await setup()
    const old = Date.now() - 20 * 60 * 1000
    const row = { user_id: "u1", status: "running" as const, option: "x", aspect_ratio: "1:1", n: 1, prompt_raw: "p" }
    await db.insert(generations).values([
      { ...row, id: "v", kind: "video", model: "wan-3.0", credits_reserved: 0, created_at: old },
      { ...row, id: "i", kind: "image", model: "flux-3-klein", credits_reserved: 0, created_at: old },
    ])
    await reapStaleGenerations(db)
    const status = Object.fromEntries((await db.select().from(generations)).map((g) => [g.id, g.status]))
    expect(status).toEqual({ v: "running", i: "failed" })
  })
})

describe("byteSpan", () => {
  test("names the bytes a range request got, and nothing for the whole file", () => {
    expect(byteSpan(undefined, 100)).toBeUndefined()
    expect(byteSpan({ offset: 0, length: 2 }, 100)).toEqual({ start: 0, end: 1 })
    expect(byteSpan({ offset: 50 }, 100)).toEqual({ start: 50, end: 99 })
    expect(byteSpan({ suffix: 10 }, 100)).toEqual({ start: 90, end: 99 })
    expect(byteSpan({ offset: 0 }, 100)).toBeUndefined()
    // How the local R2 describes the same requests.
    const local = (offset?: number, length?: number, suffix?: number) => ({ offset: offset ?? 0, length, suffix })
    expect(byteSpan(local(0, 100), 100)).toBeUndefined()
    expect(byteSpan(local(0, 2), 100)).toEqual({ start: 0, end: 1 })
    expect(byteSpan(local(undefined, undefined, 10), 100)).toEqual({ start: 90, end: 99 })
  })
})
