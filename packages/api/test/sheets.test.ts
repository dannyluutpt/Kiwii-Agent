import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import { deflateSync } from "node:zlib"
import { eq } from "drizzle-orm"
import { createApp, type ApiError } from "../src/app"
import { createSession } from "../src/auth/session"
import { characterFromSheet, characterPanels, characterSheetPrompt } from "../src/characters/sheet"
import { grant } from "../src/credits/ledger"
import { characters, files, generations, users } from "../src/db/schema"
import { grayPNG } from "../src/images/panels"
import { CreateGeneration, prepareGeneration } from "../src/images/prepare"
import { photosOf } from "../src/images/saved"
import { images } from "../src/routes/images"
import { testDatabase } from "./db"

const DAY = 24 * 60 * 60 * 1000

afterEach(() => mock.restore())

// What a PNG row filter adds back, written out again so the reader is checked against the spec rather
// than against itself.
function predictor(filter: number, left: number, up: number, corner: number) {
  if (filter === 1) return left
  if (filter === 2) return up
  if (filter === 3) return Math.floor((left + up) / 2)
  if (filter !== 4) return 0
  const guess = left + up - corner
  const ranked = [left, up, corner].map((value, rank) => ({ value, rank, gap: Math.abs(guess - value) }))
  return ranked.sort((a, b) => a.gap - b.gap || a.rank - b.rank)[0]!.value
}

// A PNG of 8-bit samples, each row filtered with filter `row % 5` the way encoders mix them, its
// data split over two IDAT chunks. The CRCs stay zero: the reader does not check them.
function png(input: { width: number; height: number; type: number; samples: number[]; palette?: number[] }) {
  const channels = input.samples.length / input.width / input.height
  const stride = input.width * channels
  const rows = new Uint8Array((stride + 1) * input.height)
  for (let y = 0; y < input.height; y++) {
    rows[y * (stride + 1)] = y % 5
    for (let x = 0; x < stride; x++) {
      const at = y * stride + x
      const left = x >= channels ? input.samples[at - channels]! : 0
      const up = y > 0 ? input.samples[at - stride]! : 0
      const corner = x >= channels && y > 0 ? input.samples[at - stride - channels]! : 0
      rows[y * (stride + 1) + 1 + x] = (input.samples[at]! - predictor(y % 5, left, up, corner)) & 255
    }
  }
  const chunk = (name: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length)
    new DataView(out.buffer).setUint32(0, body.length)
    out.set(new TextEncoder().encode(name), 4)
    out.set(body, 8)
    return out
  }
  const header = new Uint8Array(13)
  new DataView(header.buffer).setUint32(0, input.width)
  new DataView(header.buffer).setUint32(4, input.height)
  header[8] = 8
  header[9] = input.type
  const data = new Uint8Array(deflateSync(rows))
  const half = Math.floor(data.length / 2)
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    ...(input.palette ? [chunk("PLTE", new Uint8Array(input.palette))] : []),
    chunk("IDAT", data.subarray(0, half)),
    chunk("IDAT", data.subarray(half)),
    chunk("IEND", new Uint8Array()),
  ]
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  parts.reduce((at, part) => {
    out.set(part, at)
    return at + part.length
  }, 0)
  return out
}

const luma = (r: number, g: number, b: number) => Math.round(0.299 * r + 0.587 * g + 0.114 * b)

describe("grayPNG", () => {
  test("reads every row filter, and gray, RGB, palette and RGBA pictures, as gray levels", async () => {
    const width = 6
    const height = 7
    const rgb = Array.from({ length: width * height * 3 }, (_, i) => (i * 37 + (i % 7) * 11) % 256)
    const expected = Array.from({ length: width * height }, (_, i) =>
      luma(rgb[i * 3]!, rgb[i * 3 + 1]!, rgb[i * 3 + 2]!),
    )

    expect([...(await grayPNG(png({ width, height, type: 2, samples: rgb }))).pixels]).toEqual(expected)
    const rgba = Array.from({ length: width * height }, (_, i) => [
      rgb[i * 3]!,
      rgb[i * 3 + 1]!,
      rgb[i * 3 + 2]!,
      255,
    ]).flat()
    expect([...(await grayPNG(png({ width, height, type: 6, samples: rgba }))).pixels]).toEqual(expected)
    const gray = Array.from({ length: width * height }, (_, i) => (i * 53) % 256)
    expect([...(await grayPNG(png({ width, height, type: 0, samples: gray }))).pixels]).toEqual(gray)
    const palette = [10, 20, 30, 200, 100, 50, 255, 255, 255]
    const indexes = Array.from({ length: width * height }, (_, i) => i % 3)
    const read = await grayPNG(png({ width, height, type: 3, samples: indexes, palette }))
    expect([...read.pixels]).toEqual(
      indexes.map((i) => luma(palette[i * 3]!, palette[i * 3 + 1]!, palette[i * 3 + 2]!)),
    )
    expect(read).toMatchObject({ width, height })
  })

  test("refuses a PNG it cannot read rather than return wrong pixels", async () => {
    const picture = png({ width: 2, height: 2, type: 0, samples: [1, 2, 3, 4] })
    // Bit depth 16.
    picture[8 + 8 + 8] = 16
    await expect(grayPNG(picture)).rejects.toThrow("unsupported PNG")
  })
})

// A gray copy of a character sheet as wide as the picture and 128 rows high: a face panel on a
// slightly darker backdrop up to column `face`, then figures on plain background.
function sheetCopy(input: { face?: number; figures: Array<[number, number]> }) {
  const width = 1000
  const height = 128
  const pixels = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const figure = input.figures.some((range) => x >= range[0] && x < range[1]) && y >= 12 && y < 123
      const backdrop = input.face !== undefined && x < input.face ? 185 + ((x * 7 + y * 3) % 9) : 205
      pixels[y * width + x] = figure ? 60 + ((x + y) % 20) : backdrop
    }
  }
  return { width, height, pixels }
}

const FIGURES: Array<[number, number]> = [
  [380, 470],
  [560, 640],
  [720, 790],
  [860, 950],
]

describe("characterPanels", () => {
  test("the face panel ends at the edge that runs top to bottom, and the front view is the first figure", () => {
    expect(characterPanels(sheetCopy({ face: 310, figures: FIGURES }))).toEqual({
      face: 310,
      front: { left: 345, right: 515 },
    })
  })

  test("without a panel edge the face takes the left third", () => {
    expect(
      characterPanels(
        sheetCopy({
          figures: [
            [500, 580],
            [650, 720],
          ],
        }),
      ),
    ).toEqual({
      face: 333,
      front: { left: 417, right: 615 },
    })
  })
})

describe("characterSheetPrompt", () => {
  test("lays out the face and four views, then the description, in the style asked for", () => {
    const prompt = characterSheetPrompt("a Vietnamese woman around 27, light blue blouse", "photo")
    expect(prompt).toContain("Left third: a head-and-shoulders portrait of the character facing the camera")
    expect(prompt).toContain("front view, three-quarter view, side profile, back view")
    expect(prompt).toContain("photorealistic")
    expect(prompt).toContain("No text, no labels, no borders.")
    expect(prompt.endsWith("The character: a Vietnamese woman around 27, light blue blouse")).toBe(true)
    expect(characterSheetPrompt("a fox", "3d")).toContain("3D animated character")
    expect(characterSheetPrompt("a fox", "anime")).toContain("anime style")
  })
})

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
  const user = (await db.select().from(users).where(eq(users.id, "u1")).get())!
  return { db, user }
}

// The screening allows everything and answers with the description in English; what it was told is kept.
function screener() {
  const systems: string[] = []
  spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: unknown }> }
    systems.push(String(body.messages[0]!.content))
    const content = JSON.stringify({ allowed: true, reason: "", prompt: "a woman in a light blue blouse" })
    return Response.json({ choices: [{ message: { content } }], usage: { cost: 0.0001 } })
  })
  return systems
}

const sheetRequest = (db: Awaited<ReturnType<typeof testDatabase>>, user: typeof users.$inferSelect) =>
  prepareGeneration({
    db,
    bucket: {} as R2Bucket,
    apiKey: "k",
    user,
    request: CreateGeneration.parse({
      model: "nano-banana-2.1",
      option: "2K",
      aspectRatio: "16:9",
      prompt: "cô gái mặc áo blouse xanh nhạt",
      enhance: false,
    }),
    sheet: { kind: "character", prompt: (description) => characterSheetPrompt(description, "photo") },
  })

describe("character sheet runs", () => {
  test("screen the description without rewriting it, lay it out as a sheet and are marked as one", async () => {
    const { db, user } = await setup()
    await grant(db, { userID: "u1", source: "plan", amount: 10, expiresAt: Date.now() + DAY, reason: "p" })
    const systems = screener()

    const prepared = await sheetRequest(db, user)

    expect(systems[0]).toContain("return the user's prompt unchanged")
    expect(prepared.generation).toMatchObject({
      sheet: "character",
      model: "nano-banana-2.1",
      option: "2K",
      aspect_ratio: "16:9",
      credits_reserved: 3,
      prompt_raw: "cô gái mặc áo blouse xanh nhạt",
      prompt_enhanced: characterSheetPrompt("a woman in a light blue blouse", "photo"),
    })
  })

  test("are for paid plans only, even for a free account with trial credits", async () => {
    const { db, user } = await setup("free")
    screener()
    await expect(sheetRequest(db, user)).rejects.toMatchObject({ code: "SHEET_REQUIRES_PAID" })
    await grant(db, { userID: "u1", source: "trial", amount: 3, expiresAt: Date.now() + DAY, reason: "t" })
    const error = (await sheetRequest(db, user).catch((caught: unknown) => caught)) as ApiError
    expect(error).toMatchObject({ code: "SHEET_REQUIRES_PAID", status: 403 })
  })
})

function fakeBucket() {
  const store = new Map<string, Uint8Array>()
  const bucket = {
    async put(key: string, value: Uint8Array | ArrayBuffer) {
      store.set(key, new Uint8Array(value))
    },
    async get(key: string) {
      const bytes = store.get(key)
      if (!bytes) return null
      return {
        httpMetadata: { contentType: "image/jpeg" },
        arrayBuffer: async () => bytes.slice().buffer,
        body: new Blob([bytes]).stream(),
      }
    },
    async delete() {},
  } as unknown as R2Bucket
  return { store, bucket }
}

// Cloudflare Images stand-in for a 1000×560 sheet: its gray copy is `copy`, and a cut answers with
// the trim it was asked for, so the test can read which panel each photo is.
function fakeImages(copy: ReturnType<typeof sheetCopy>, failure?: string): ImagesBinding {
  const input = () => {
    const transforms: ImageTransform[] = []
    const handle: ImageTransformer = {
      transform: (transform) => {
        transforms.push(transform)
        return handle
      },
      draw: () => handle,
      output: async (options) => {
        if (failure) throw new Error(failure)
        const body =
          options.format === "image/png"
            ? png({ width: copy.width, height: copy.height, type: 0, samples: [...copy.pixels] })
            : new TextEncoder().encode(`cut ${JSON.stringify(transforms[0]?.trim)}`)
        return {
          response: () => new Response(body),
          contentType: () => options.format,
          image: () => new Blob([body]).stream(),
        }
      },
    }
    return handle
  }
  return { info: async () => ({ format: "image/jpeg", fileSize: 1, width: 1000, height: 560 }), input }
}

// A sheet run of the account with its one picture, plus a picture of an ordinary run.
async function seedSheet(db: Awaited<ReturnType<typeof testDatabase>>, bucket: R2Bucket, userID = "u1") {
  for (const [id, sheet] of [
    [`sheet-run-${userID}`, "character"],
    [`plain-run-${userID}`, null],
  ] as const) {
    await db.insert(generations).values({
      id,
      user_id: userID,
      status: "done",
      model: "nano-banana-2.1",
      option: "2K",
      aspect_ratio: "16:9",
      n: 1,
      prompt_raw: "Lan",
      credits_reserved: 3,
      sheet,
    })
    await bucket.put(`u/${userID}/${id}.jpg`, new TextEncoder().encode(`picture of ${id}`))
    await db.insert(files).values({
      id: `${id}-file`,
      user_id: userID,
      r2_key: `u/${userID}/${id}.jpg`,
      name: `${id}.jpg`,
      mime: "image/jpeg",
      size: 10,
      kind: "image",
      generation_id: id,
    })
  }
}

describe("characterFromSheet", () => {
  test("saves the face panel, the front view and the whole sheet, in that order", async () => {
    const { db } = await setup()
    const { store, bucket } = fakeBucket()
    await seedSheet(db, bucket)

    const row = await characterFromSheet(db, bucket, fakeImages(sheetCopy({ face: 310, figures: FIGURES })), {
      userID: "u1",
      name: "Lan",
      fileID: "sheet-run-u1-file",
    })

    const photos = await Promise.all(
      photosOf(row).map(async (id) => (await db.select().from(files).where(eq(files.id, id)).get())!),
    )
    expect(photos.map((photo) => photo.kind)).toEqual(["character", "character", "character"])
    const text = photos.map((photo) => new TextDecoder().decode(store.get(photo.r2_key)))
    expect(text).toEqual([
      `cut ${JSON.stringify({ left: 0, top: 0, right: 690, bottom: 0 })}`,
      `cut ${JSON.stringify({ left: 345, top: 0, right: 485, bottom: 0 })}`,
      "picture of sheet-run-u1",
    ])
    expect(photos.map((photo) => photo.name)).toEqual(["face.jpg", "front.jpg", "sheet-run-u1.jpg"])
  })

  test("keeps the whole sheet alone when it cannot be cut", async () => {
    const { db } = await setup()
    const { store, bucket } = fakeBucket()
    await seedSheet(db, bucket)
    const input = { userID: "u1", name: "Lan", fileID: "sheet-run-u1-file" }

    const failed = await characterFromSheet(db, bucket, fakeImages(sheetCopy({ figures: [] }), "9523"), input)
    const unbound = await characterFromSheet(db, bucket, undefined, input)

    for (const row of [failed, unbound]) {
      const photos = photosOf(row)
      expect(photos).toHaveLength(1)
      const file = (await db.select().from(files).where(eq(files.id, photos[0]!)).get())!
      expect(new TextDecoder().decode(store.get(file.r2_key))).toBe("picture of sheet-run-u1")
    }
  })

  test("takes only a sheet picture of the account, and stops at the character limit before writing", async () => {
    const { db } = await setup()
    const { store, bucket } = fakeBucket()
    await seedSheet(db, bucket)
    await seedSheet(db, bucket, "u2")
    const images = fakeImages(sheetCopy({ face: 310, figures: FIGURES }))
    const save = (fileID: string) =>
      characterFromSheet(db, bucket, images, { userID: "u1", name: "Lan", fileID }).catch((error: unknown) => error)

    expect(await save("plain-run-u1-file")).toMatchObject({ code: "SHEET_NOT_FOUND", status: 404 })
    expect(await save("sheet-run-u2-file")).toMatchObject({ code: "SHEET_NOT_FOUND", status: 404 })

    await db
      .insert(characters)
      .values(Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, user_id: "u1", name: `C${i}`, file_ids: "[]" })))
    const objects = store.size
    expect(await save("sheet-run-u1-file")).toMatchObject({ code: "CHARACTER_LIMIT", status: 409 })
    expect(store.size).toBe(objects)
  })
})

describe("the studio's list of runs", () => {
  test("leaves sheets out, lists them when asked, and prices a sheet for paid plans only", async () => {
    const { db } = await setup()
    const { bucket } = fakeBucket()
    await seedSheet(db, bucket)
    const app = createApp()
    app.use("*", async (c, next) => {
      c.set("db", db)
      await next()
    })
    app.route("/", images)
    const cookie = `kiwii_session=${await createSession(db, { userID: "u1" })}`
    const list = async (query: string) =>
      (
        (await (await app.request(`/generations${query}`, { headers: { cookie } }, {})).json()) as {
          generations: Array<{ id: string; sheet: string | null }>
        }
      ).generations

    expect((await list("")).map((g) => g.id)).toEqual(["plain-run-u1"])
    expect(await list("?sheet=character")).toMatchObject([{ id: "sheet-run-u1", sheet: "character" }])
    const models = async () =>
      (
        (await (await app.request("/models", { headers: { cookie } }, {})).json()) as {
          sheets: { character: number | null }
        }
      ).sheets
    expect(await models()).toEqual({ character: 3 })
    await db.update(users).set({ tier: "free", tier_until: null }).where(eq(users.id, "u1"))
    expect(await models()).toEqual({ character: null })
  })
})
