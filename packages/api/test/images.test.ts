import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { balance, grant, reserve } from "../src/credits/ledger"
import { credit_ledger, generation_images, generations } from "../src/db/schema"
import { blockedByDenylist, enhancePrompt, reusableRewrite } from "../src/images/enhance"
import { friendly, reapStaleGenerations, runGeneration, STALE_AFTER_MS } from "../src/images/generate"
import { IMAGE_MODELS, imageCreditCost } from "../src/images/models"
import { testDatabase } from "./db"

const DAY = 24 * 60 * 60 * 1000
const PIXEL =
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=="

describe("imageCreditCost", () => {
  test("multiplies by n and adds the reference surcharge once", () => {
    expect(imageCreditCost(IMAGE_MODELS, { model: "flux-3-klein", option: "4K", n: 3, references: 0 })).toBe(6)
    expect(imageCreditCost(IMAGE_MODELS, { model: "gpt-image-2.5", option: "high", n: 1, references: 2 })).toBe(11)
    expect(imageCreditCost(IMAGE_MODELS, { model: "nano-banana-2.1", option: "2K", n: 4, references: 0 })).toBe(12)
  })
  test("rejects unknown or uncalibrated options and bad counts", () => {
    expect(
      imageCreditCost(IMAGE_MODELS, { model: "gpt-image-2.5", option: "max", n: 1, references: 0 }),
    ).toBeUndefined()
    expect(imageCreditCost(IMAGE_MODELS, { model: "flux-3-klein", option: "8K", n: 1, references: 0 })).toBeUndefined()
    expect(imageCreditCost(IMAGE_MODELS, { model: "flux-3-klein", option: "1K", n: 5, references: 0 })).toBeUndefined()
  })
})

describe("enhancePrompt", () => {
  // The screening and rewrite is a paid call too; its cost starts the generation's cost_usd.
  async function enhanceWith(reply: Response) {
    const original = globalThis.fetch
    let sent: Record<string, unknown> | undefined
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>
      return reply
    }) as typeof fetch
    try {
      const result = await enhancePrompt({
        apiKey: "k",
        model: "gpt-image-2.5",
        prompt: "con cáo đỏ trên tuyết",
        rewrite: true,
        references: 0,
      })
      return { result, sent }
    } finally {
      globalThis.fetch = original
    }
  }
  const answer = (content: Record<string, unknown>, cost: number) =>
    Response.json({ choices: [{ message: { content: JSON.stringify(content) } }], usage: { cost } })

  test("asks OpenRouter for the cost and reports it with the rewrite", async () => {
    const { result, sent } = await enhanceWith(
      answer({ allowed: true, reason: "", prompt: "A red fox in fresh snow, golden hour" }, 0.00011),
    )
    expect(result).toEqual({
      allowed: true,
      prompt: "A red fox in fresh snow, golden hour",
      rewritten: true,
      costUsd: 0.00011,
    })
    expect(sent?.usage).toEqual({ include: true })
  })

  test("a blocked prompt still reports what the check cost", async () => {
    const { result } = await enhanceWith(answer({ allowed: false, reason: "Không được phép", prompt: "" }, 0.00009))
    expect(result).toMatchObject({ allowed: false, reason: "Không được phép", costUsd: 0.00009 })
  })

  test("a failed call costs nothing and keeps the customer's prompt", async () => {
    const { result } = await enhanceWith(new Response("upstream error", { status: 502 }))
    expect(result).toEqual({ allowed: true, prompt: "con cáo đỏ trên tuyết", rewritten: false, costUsd: 0 })
  })
})

describe("reusableRewrite", () => {
  const failed = {
    status: "failed",
    prompt_raw: "con cáo đỏ trên tuyết",
    prompt_enhanced: "A red fox in fresh snow, golden hour",
    model: "gpt-image-2.5",
    reference_file_ids: JSON.stringify(["ref-1"]),
    enhance: 1,
  }
  const retry = { prompt: "con cáo đỏ trên tuyết", model: "gpt-image-2.5", referenceIDs: ["ref-1"], enhance: true }

  test("a retry of a failed run reuses the prompt that run was screened and rewritten for", () => {
    expect(reusableRewrite(failed, retry)).toBe("A red fox in fresh snow, golden hour")
  })

  test("anything that would change the rewrite is screened and rewritten afresh", () => {
    expect(reusableRewrite(undefined, retry)).toBeUndefined()
    expect(reusableRewrite({ ...failed, status: "done" }, retry)).toBeUndefined()
    expect(reusableRewrite({ ...failed, prompt_enhanced: null }, retry)).toBeUndefined()
    expect(reusableRewrite(failed, { ...retry, prompt: "con cáo trắng trên tuyết" })).toBeUndefined()
    expect(reusableRewrite(failed, { ...retry, model: "flux-3-klein" })).toBeUndefined()
    expect(reusableRewrite(failed, { ...retry, referenceIDs: [] })).toBeUndefined()
    expect(reusableRewrite(failed, { ...retry, enhance: false })).toBeUndefined()
  })
})

describe("denylist", () => {
  test("blocks sexual content involving minors in both languages, allows ordinary prompts", () => {
    expect(blockedByDenylist("a nude child on the beach")).toBe(true)
    expect(blockedByDenylist("bé gái khỏa thân")).toBe(true)
    expect(blockedByDenylist("a child playing on the beach, golden hour")).toBe(false)
    expect(blockedByDenylist("chân dung cô gái áo dài giữa phố cổ Hội An")).toBe(false)
  })
})

function fakeBucket() {
  const store = new Map<string, { bytes: Uint8Array; mime: string }>()
  return {
    store,
    bucket: {
      async put(key: string, value: Uint8Array | ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) {
        store.set(key, { bytes: new Uint8Array(value as ArrayBuffer), mime: options?.httpMetadata?.contentType ?? "" })
      },
    } as unknown as R2Bucket,
  }
}

type ImageBody = { model: string; n: number; stream: boolean; input_references?: unknown[] }

function mockFetch(handler: (body: ImageBody) => Response | Promise<Response>) {
  const original = globalThis.fetch
  globalThis.fetch = (async (_url: unknown, init?: RequestInit) =>
    handler(JSON.parse(String(init?.body)) as ImageBody)) as typeof fetch
  return () => {
    globalThis.fetch = original
  }
}

async function seed(
  db: Awaited<ReturnType<typeof testDatabase>>,
  input: { model: string; option: string; n: number; credits: number; costUsd?: number },
) {
  await grant(db, { userID: "u1", source: "plan", amount: 100, expiresAt: Date.now() + DAY, reason: "p" })
  const id = `gen-${Math.random().toString(36).slice(2)}`
  await reserve(db, { userID: "u1", amount: input.credits, generationID: id, reason: "t" })
  await db.insert(generations).values({
    id,
    user_id: "u1",
    status: "running",
    model: input.model,
    option: input.option,
    aspect_ratio: "1:1",
    n: input.n,
    prompt_raw: "a cat",
    credits_reserved: input.credits,
    cost_usd: input.costUsd,
  })
  return (await db.select().from(generations).where(eq(generations.id, id)).get())!
}

describe("runGeneration", () => {
  test("single-image provider: one request per image, partial failure refunds per image", async () => {
    const db = await testDatabase()
    const generation = await seed(db, { model: "flux-3-klein", option: "4K", n: 3, credits: 6 })
    const { bucket, store } = fakeBucket()
    let calls = 0
    const restore = mockFetch((body) => {
      calls++
      expect(body.n).toBe(1)
      if (calls === 2) return new Response(JSON.stringify({ error: { message: "boom" } }), { status: 502 })
      return Response.json({ data: [{ b64_json: PIXEL, media_type: "image/jpeg" }], usage: { cost: 0.036 } })
    })
    const events: string[] = []
    try {
      await runGeneration({
        db,
        bucket,
        apiKey: "k",
        generation,
        model: IMAGE_MODELS[0]!,
        perImageCredits: 2,
        references: [],
        emit: (event) => {
          events.push(event.type)
        },
      })
    } finally {
      restore()
    }
    expect(calls).toBe(3)
    expect(store.size).toBe(2)
    expect(events.filter((e) => e === "image")).toHaveLength(2)
    expect(events.at(-1)).toBe("done")
    const row = (await db.select().from(generations).where(eq(generations.id, generation.id)).get())!
    expect(row).toMatchObject({ status: "done", credits_final: 4 })
    expect(row.cost_usd).toBeCloseTo(0.072)
    expect(await balance(db, "u1")).toBe(96)
    expect(
      await db.select().from(generation_images).where(eq(generation_images.generation_id, generation.id)),
    ).toHaveLength(2)
  })

  test("streaming provider forwards partials, stores the final image and settles", async () => {
    const db = await testDatabase()
    // 0.0002 for the prompt screening and rewrite, recorded when the generation was created.
    const generation = await seed(db, { model: "gpt-image-2.5", option: "medium", n: 1, credits: 3, costUsd: 0.0002 })
    const { bucket } = fakeBucket()
    const restore = mockFetch(() => {
      const sse = [
        `data: ${JSON.stringify({ type: "image_generation.partial_image", partial_image_index: 0, b64_json: PIXEL })}`,
        `data: ${JSON.stringify({ type: "image_generation.completed", b64_json: PIXEL, media_type: "image/jpeg", usage: { cost: 0.05 } })}`,
        "data: [DONE]",
        "",
      ].join("\n\n")
      return new Response(sse, { headers: { "content-type": "text/event-stream" } })
    })
    const events: string[] = []
    try {
      await runGeneration({
        db,
        bucket,
        apiKey: "k",
        generation,
        model: IMAGE_MODELS[2]!,
        perImageCredits: 3,
        references: [],
        emit: (event) => {
          events.push(event.type)
        },
      })
    } finally {
      restore()
    }
    expect(events).toEqual(["partial", "image", "done"])
    expect(await balance(db, "u1")).toBe(97)
    const ledger = await db.select().from(credit_ledger).where(eq(credit_ledger.generation_id, generation.id))
    expect(ledger.map((r) => r.type)).toEqual(["reserve", "settle"])
    expect(ledger[1]?.reason).toBe("cost_usd=0.0502")
    const row = (await db.select().from(generations).where(eq(generations.id, generation.id)).get())!
    expect(row.cost_usd).toBeCloseTo(0.0502)
  })

  test("an edit (references) on the streaming model is sent without streaming", async () => {
    // OpenRouter refuses stream=true for image-to-image: "Streaming is not supported for
    // image-to-image (edit) requests".
    const db = await testDatabase()
    const generation = await seed(db, { model: "gpt-image-2.5", option: "medium", n: 2, credits: 7 })
    const { bucket } = fakeBucket()
    const bodies: ImageBody[] = []
    const restore = mockFetch((body) => {
      bodies.push(body)
      if (body.stream)
        return new Response(
          JSON.stringify({ error: { message: "Streaming is not supported for image-to-image (edit) requests" } }),
          { status: 400 },
        )
      return Response.json({
        data: [
          { b64_json: PIXEL, media_type: "image/jpeg" },
          { b64_json: PIXEL, media_type: "image/jpeg" },
        ],
        usage: { cost: 0.1 },
      })
    })
    const events: string[] = []
    try {
      await runGeneration({
        db,
        bucket,
        apiKey: "k",
        generation,
        model: IMAGE_MODELS[2]!,
        perImageCredits: 3,
        references: [{ type: "image_url", image_url: { url: "data:image/jpeg;base64," + PIXEL } }],
        emit: (event) => {
          events.push(event.type)
        },
      })
    } finally {
      restore()
    }
    expect(bodies).toHaveLength(1)
    expect(bodies[0]).toMatchObject({ stream: false, n: 2 })
    expect(bodies[0]!.input_references).toHaveLength(1)
    expect(events).toEqual(["image", "image", "done"])
  })

  test("total failure marks failed and refunds everything", async () => {
    const db = await testDatabase()
    const generation = await seed(db, { model: "nano-banana-2.1", option: "1K", n: 2, credits: 4, costUsd: 0.0001 })
    const { bucket } = fakeBucket()
    const restore = mockFetch(
      () => new Response(JSON.stringify({ error: { message: "rate limited" } }), { status: 429 }),
    )
    const events: Array<{ type: string; message?: string }> = []
    try {
      await runGeneration({
        db,
        bucket,
        apiKey: "k",
        generation,
        model: IMAGE_MODELS[1]!,
        perImageCredits: 2,
        references: [],
        emit: (event) => {
          events.push(event)
        },
      })
    } finally {
      restore()
    }
    expect(events.at(-1)?.type).toBe("error")
    expect(events.at(-1)?.message).toContain("quá tải")
    expect(await balance(db, "u1")).toBe(100)
    // The customer gets every credit back; the rewrite Kiwii paid for stays in the cost.
    expect(await db.select().from(generations).where(eq(generations.id, generation.id)).get()).toMatchObject({
      status: "failed",
      credits_final: 0,
      cost_usd: 0.0001,
    })
  })
})

describe("reapStaleGenerations", () => {
  test("fails and refunds only generations older than the stale window", async () => {
    const db = await testDatabase()
    const fresh = await seed(db, { model: "flux-3-klein", option: "1K", n: 1, credits: 1 })
    const stale = await seed(db, { model: "flux-3-klein", option: "1K", n: 1, credits: 1 })
    await db
      .update(generations)
      .set({ created_at: Date.now() - STALE_AFTER_MS - 1000 })
      .where(eq(generations.id, stale.id))
    expect(await reapStaleGenerations(db)).toBe(1)
    expect(await db.select().from(generations).where(eq(generations.id, stale.id)).get()).toMatchObject({
      status: "failed",
    })
    expect(await db.select().from(generations).where(eq(generations.id, fresh.id)).get()).toMatchObject({
      status: "running",
    })
    // Two grants of 100, two reserves of 1, one refunded.
    expect(await balance(db, "u1")).toBe(199)
  })
})

describe("friendly", () => {
  test("tells the customer what went wrong without the provider's own words", () => {
    const tooBig =
      '422: Black Forest Labs submit returned 422: {"detail":[{"msg":"Value error, Images[0] dimensions exceed 20 megapixels"}]}'
    expect(friendly(tooBig)).toBe("Ảnh tham chiếu quá lớn, hãy dùng ảnh nhỏ hơn. Credit đã được hoàn")
    expect(friendly("502: upstream exploded")).toBe("Không tạo được ảnh, credit đã được hoàn")
    expect(friendly("data policy: ZDR")).not.toContain("OpenRouter")
  })
})
