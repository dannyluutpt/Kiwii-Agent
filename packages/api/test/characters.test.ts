import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import { eq } from "drizzle-orm"
import {
  castPhotos,
  cleanName,
  createCharacter,
  deleteCharacter,
  ownCharacter,
  photosOf,
  presentCharacter,
  type Character,
} from "../src/characters/store"
import { grant } from "../src/credits/ledger"
import { characters, files, users } from "../src/db/schema"
import { castLegend } from "../src/images/enhance"
import { CreateGeneration, prepareGeneration } from "../src/images/prepare"
import { testDatabase } from "./db"

const DAY = 24 * 60 * 60 * 1000

afterEach(() => mock.restore())

function fakeBucket() {
  const store = new Map<string, { bytes: Uint8Array; mime: string }>()
  const bucket = {
    async put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) {
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
    async delete(keys: string | string[]) {
      for (const key of [keys].flat()) store.delete(key)
    },
  } as unknown as R2Bucket
  return { store, bucket }
}

async function setup() {
  const db = await testDatabase()
  await db.insert(users).values({
    id: "u1",
    email: "u1@x",
    password_hash: "h",
    password_salt: "s",
    password_iterations: 1,
    tier: "plus",
    tier_until: Date.now() + 30 * DAY,
  })
  await grant(db, { userID: "u1", source: "plan", amount: 100, expiresAt: Date.now() + DAY, reason: "p" })
  const user = (await db.select().from(users).where(eq(users.id, "u1")).get())!
  const { store, bucket } = fakeBucket()
  // A picture of the account: `key` in R2 holds bytes that say which picture it is.
  const picture = async (id: string, userID = "u1") => {
    await bucket.put(`u/${userID}/${id}.jpg`, new TextEncoder().encode(id).buffer, {
      httpMetadata: { contentType: "image/jpeg" },
    })
    await db.insert(files).values({
      id,
      user_id: userID,
      r2_key: `u/${userID}/${id}.jpg`,
      name: `${id}.jpg`,
      mime: "image/jpeg",
      size: id.length,
      kind: "reference",
    })
  }
  return { db, user, store, bucket, picture }
}

// What a photo the model was sent says, read back from its data URL.
const decoded = (url: string) => atob(url.slice(url.indexOf(",") + 1))

describe("characters", () => {
  test("saving copies the photos, so the character outlives the pictures it came from", async () => {
    const { db, store, bucket, picture } = await setup()
    await picture("p1")
    await picture("p2")
    const row = await createCharacter(db, bucket, { userID: "u1", name: "Lan", fileIDs: ["p2", "p1", "p2"] })

    const copies = photosOf(row)
    expect(copies).toHaveLength(2)
    expect(copies).not.toContain("p1")
    const stored = await db.select().from(files).where(eq(files.kind, "character"))
    expect(stored.map((file) => file.id).sort()).toEqual([...copies].sort())
    // In the order given, as new objects with the same bytes.
    const first = stored.find((file) => file.id === copies[0])!
    expect(new TextDecoder().decode(store.get(first.r2_key)!.bytes)).toBe("p2")
    expect(first.r2_key).not.toBe("u/u1/p2.jpg")
    expect(presentCharacter(row).images[0]).toEqual({ fileID: copies[0], url: `/api/images/files/${copies[0]}` })
  })

  test("only the account's own pictures can become a character", async () => {
    const { db, bucket, picture } = await setup()
    await picture("theirs", "u2")
    const error = await createCharacter(db, bucket, { userID: "u1", name: "Lan", fileIDs: ["theirs"] }).catch(
      (reason: unknown) => reason,
    )
    expect(error).toMatchObject({ status: 404 })
    expect(await db.select().from(characters)).toHaveLength(0)
  })

  test("deleting a character removes its copies and leaves the source pictures", async () => {
    const { db, store, bucket, picture } = await setup()
    await picture("p1")
    const row = await createCharacter(db, bucket, { userID: "u1", name: "Lan", fileIDs: ["p1"] })
    await deleteCharacter(db, bucket, await ownCharacter(db, "u1", row.id))

    expect(await db.select().from(characters)).toHaveLength(0)
    expect((await db.select().from(files)).map((file) => file.id)).toEqual(["p1"])
    expect([...store.keys()]).toEqual(["u/u1/p1.jpg"])
  })

  test("a name stays one plain line", () => {
    expect(cleanName('  Cô "Lan"\nbé  ')).toBe("Cô Lan bé")
    expect(cleanName("x".repeat(60))).toHaveLength(40)
  })

  test("each character keeps one photo at least and takes more in turn while there is room", () => {
    const character = (id: string, photos: number): Character => ({
      id,
      user_id: "u1",
      name: id,
      file_ids: JSON.stringify(Array.from({ length: photos }, (_, i) => `${id}${i + 1}`)),
      created_at: 0,
    })
    const lan = character("lan", 4)
    const minh = character("minh", 2)
    expect(castPhotos([lan], 4)).toEqual([["lan1", "lan2", "lan3", "lan4"]])
    expect(castPhotos([lan, minh], 4)).toEqual([
      ["lan1", "lan2"],
      ["minh1", "minh2"],
    ])
    expect(castPhotos([lan, minh], 3)).toEqual([["lan1", "lan2"], ["minh1"]])
    // No room left by the pictures the run works from: one photo each all the same.
    expect(castPhotos([lan, minh], -2)).toEqual([["lan1"], ["minh1"]])
  })

  // A photo used whole made the person pose as in it, usually facing the camera.
  test("the legend says which reference images show whom, and that they are for identity only", () => {
    expect(castLegend([], 2)).toBe("")
    expect(castLegend([{ name: "Lan", images: 2 }], 0).split("\n")).toEqual([
      "Reference images 1–2: Lan.",
      "Use Lan's reference images only for who they are: keep their face, facial features, skin tone, hairstyle and build, and their clothes unless the prompt below changes them. Do not copy the pose, head angle, gaze, expression, framing, background or light of those photos.",
    ])
    expect(
      castLegend(
        [
          { name: "Lan", images: 1 },
          { name: "Minh", images: 2 },
        ],
        1,
      ).split("\n"),
    ).toEqual([
      "Reference image 1: Lan.",
      "Reference images 2–3: Minh.",
      "Reference image 4: the picture to work from.",
      "Use each character's reference images only for who they are: keep their face, facial features, skin tone, hairstyle and build, and their clothes unless the prompt below changes them. Do not copy the pose, head angle, gaze, expression, framing, background or light of those photos.",
    ])
  })
})

describe("prepareGeneration with characters", () => {
  // The screening allows everything and returns the prompt rewritten; what it was asked is kept.
  function screener() {
    const systems: string[] = []
    const asked: unknown[] = []
    spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: unknown }> }
      systems.push(String(body.messages[0]!.content))
      asked.push(body.messages[1]!.content)
      const content = JSON.stringify({ allowed: true, reason: "", prompt: "Rewritten" })
      return Response.json({ choices: [{ message: { content } }], usage: { cost: 0.0001 } })
    })
    return Object.assign(systems, { asked })
  }

  // Cloudflare Images stand-in: the small copy of a picture is "small:" and the picture's bytes.
  function fakeImages(failure?: string): ImagesBinding {
    const input = (stream: ReadableStream<Uint8Array>) => {
      const bytes = new Response(stream).text()
      const handle: ImageTransformer = {
        transform: () => handle,
        draw: () => handle,
        output: async () => {
          if (failure) throw new Error(failure)
          const small = `small:${await bytes}`
          return {
            response: () => new Response(small),
            contentType: () => "image/jpeg",
            image: () => new Blob([small]).stream(),
          }
        },
      }
      return handle
    }
    return { info: async () => ({ format: "image/jpeg", fileSize: 0, width: 1, height: 1 }), input }
  }

  test("the characters' photos lead the references, the legend opens the prompt, and they are charged as references", async () => {
    const { db, user, bucket, picture } = await setup()
    await picture("a1")
    await picture("a2")
    await picture("b1")
    await picture("scene")
    const lan = await createCharacter(db, bucket, { userID: "u1", name: "Lan", fileIDs: ["a1", "a2"] })
    const minh = await createCharacter(db, bucket, { userID: "u1", name: "Minh", fileIDs: ["b1"] })
    const systems = screener()

    const prepared = await prepareGeneration({
      db,
      bucket,
      apiKey: "k",
      user,
      request: CreateGeneration.parse({
        model: "nano-banana-2.1",
        option: "1K",
        aspectRatio: "1:1",
        prompt: "Lan và Minh ngồi uống cà phê ở quán này",
        referenceFileIDs: ["scene"],
        characterIDs: [lan.id, minh.id],
      }),
    })

    expect(prepared.references.map((ref) => decoded(ref.image_url.url))).toEqual(["a1", "a2", "b1", "scene"])
    expect(prepared.legend.split("\n").slice(0, 3)).toEqual([
      "Reference images 1–2: Lan.",
      "Reference image 3: Minh.",
      "Reference image 4: the picture to work from.",
    ])
    expect(prepared.generation).toMatchObject({
      reference_file_ids: JSON.stringify(["scene"]),
      character_ids: JSON.stringify([lan.id, minh.id]),
      // Nano Banana 1K is 2 credits, and the run reads reference pictures: +1.
      credits_reserved: 3,
    })
    expect(systems[0]).toContain('The picture features "Lan" and "Minh", saved characters')
    expect(systems[0]).toContain("They also attached 1 picture(s) to work from, numbered after the characters' photos")
  })

  test("the pictures the run works from give way to the characters' photos past the model's limit", async () => {
    const { db, user, bucket, picture } = await setup()
    for (const id of ["a1", "b1", "r1", "r2", "r3", "r4"]) await picture(id)
    const lan = await createCharacter(db, bucket, { userID: "u1", name: "Lan", fileIDs: ["a1"] })
    const minh = await createCharacter(db, bucket, { userID: "u1", name: "Minh", fileIDs: ["b1"] })
    screener()

    const prepared = await prepareGeneration({
      db,
      bucket,
      apiKey: "k",
      user,
      request: CreateGeneration.parse({
        model: "flux-3-klein",
        option: "1K",
        aspectRatio: "1:1",
        prompt: "Lan và Minh",
        referenceFileIDs: ["r1", "r2", "r3", "r4"],
        characterIDs: [lan.id, minh.id],
      }),
    })

    expect(prepared.references.map((ref) => decoded(ref.image_url.url))).toEqual(["a1", "b1", "r1", "r2"])
    expect(prepared.generation.reference_file_ids).toBe(JSON.stringify(["r1", "r2"]))
    // FLUX reads references at no extra cost.
    expect(prepared.generation.credits_reserved).toBe(1)
  })

  test("the screening and rewrite looks at small copies of the pictures to work from, not at the characters' photos", async () => {
    const { db, user, bucket, picture } = await setup()
    await picture("a1")
    await picture("a2")
    await picture("scene")
    const lan = await createCharacter(db, bucket, { userID: "u1", name: "Lan", fileIDs: ["a1", "a2"] })
    const systems = screener()

    await prepareGeneration({
      db,
      bucket,
      images: fakeImages(),
      apiKey: "k",
      user,
      request: CreateGeneration.parse({
        model: "nano-banana-2.1",
        option: "1K",
        aspectRatio: "1:1",
        prompt: "Lan ngồi uống cà phê ở quán này",
        referenceFileIDs: ["scene"],
        characterIDs: [lan.id],
      }),
    })

    expect(systems.asked[0]).toEqual([
      { type: "text", text: "Lan ngồi uống cà phê ở quán này" },
      { type: "text", text: "Reference image 3:" },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${btoa("small:scene")}` } },
    ])
  })

  test("when no small copy can be made, the run goes ahead and the rewrite is told how many pictures there are", async () => {
    const { db, user, bucket, picture } = await setup()
    await picture("scene")
    const systems = screener()
    spyOn(console, "warn").mockImplementation(() => {})

    const prepared = await prepareGeneration({
      db,
      bucket,
      images: fakeImages("9422: usage limit reached"),
      apiKey: "k",
      user,
      request: CreateGeneration.parse({
        model: "flux-3-klein",
        option: "1K",
        aspectRatio: "1:1",
        prompt: "Đổi nền sang bãi biển",
        referenceFileIDs: ["scene"],
      }),
    })

    expect(prepared.generation.status).toBe("running")
    expect(systems.asked[0]).toBe("Đổi nền sang bãi biển")
    expect(systems[0]).toContain("They attached 1 reference image(s), which you cannot see.")
  })

  test("a character of another account cannot be put in a run", async () => {
    const { db, user, bucket, picture } = await setup()
    await picture("x1", "u2")
    const theirs = await createCharacter(db, bucket, { userID: "u2", name: "X", fileIDs: ["x1"] })
    screener()
    const error = await prepareGeneration({
      db,
      bucket,
      apiKey: "k",
      user,
      request: CreateGeneration.parse({
        model: "flux-3-klein",
        option: "1K",
        aspectRatio: "1:1",
        prompt: "X",
        characterIDs: [theirs.id],
      }),
    }).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ status: 404, code: "CHARACTER_NOT_FOUND" })
  })
})
