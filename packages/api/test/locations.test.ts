import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import { eq } from "drizzle-orm"
import { createCharacter } from "../src/characters/store"
import { grant } from "../src/credits/ledger"
import { files, locations, users } from "../src/db/schema"
import { castLegend } from "../src/images/enhance"
import { CreateGeneration, prepareGeneration } from "../src/images/prepare"
import { CreateSaved, photosOf, presentSaved } from "../src/images/saved"
import { createLocation, deleteLocation, MAX_LOCATIONS, ownLocation, renameLocation } from "../src/locations/store"
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
function fakeImages(): ImagesBinding {
  const input = (stream: ReadableStream<Uint8Array>) => {
    const bytes = new Response(stream).text()
    const handle: ImageTransformer = {
      transform: () => handle,
      draw: () => handle,
      output: async () => {
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

describe("locations", () => {
  test("saving copies the photos, so the location outlives the pictures it came from", async () => {
    const { db, store, bucket, picture } = await setup()
    await picture("p1")
    await picture("p2")
    const row = await createLocation(db, bucket, { userID: "u1", name: "Quán Gió", fileIDs: ["p2", "p1"] })

    const copies = photosOf(row)
    expect(copies).toHaveLength(2)
    const stored = await db.select().from(files).where(eq(files.kind, "location"))
    expect(stored.map((file) => file.id).sort()).toEqual([...copies].sort())
    const first = stored.find((file) => file.id === copies[0])!
    expect(new TextDecoder().decode(store.get(first.r2_key)!.bytes)).toBe("p2")
    expect(presentSaved(row)).toMatchObject({
      name: "Quán Gió",
      images: [{ fileID: copies[0], url: `/api/images/files/${copies[0]}` }, { fileID: copies[1] }],
    })
  })

  test("a name and its photos are checked like a character's", () => {
    expect(CreateSaved.parse({ name: '  Quán "Gió"\n', fileIDs: ["p1"] }).name).toBe("Quán Gió")
    expect(CreateSaved.safeParse({ name: "Quán", fileIDs: [] }).success).toBe(false)
    expect(CreateSaved.safeParse({ name: "Quán", fileIDs: ["1", "2", "3", "4", "5"] }).success).toBe(false)
    expect(CreateSaved.safeParse({ name: " \n ", fileIDs: ["p1"] }).success).toBe(false)
  })

  test("only the account's own pictures and locations can be used", async () => {
    const { db, bucket, picture } = await setup()
    await picture("theirs", "u2")
    const error = await createLocation(db, bucket, { userID: "u1", name: "Quán", fileIDs: ["theirs"] }).catch(
      (reason: unknown) => reason,
    )
    expect(error).toMatchObject({ status: 404, code: "FILE_NOT_FOUND" })
    const theirs = await createLocation(db, bucket, { userID: "u2", name: "Quán", fileIDs: ["theirs"] })
    const missing = await ownLocation(db, "u1", theirs.id).catch((reason: unknown) => reason)
    expect(missing).toMatchObject({ status: 404, code: "LOCATION_NOT_FOUND" })
  })

  test("a location can be renamed, and deleting it removes its copies and leaves the source pictures", async () => {
    const { db, store, bucket, picture } = await setup()
    await picture("p1")
    const row = await createLocation(db, bucket, { userID: "u1", name: "Quán", fileIDs: ["p1"] })
    await renameLocation(db, await ownLocation(db, "u1", row.id), "Quán Gió")
    expect((await ownLocation(db, "u1", row.id)).name).toBe("Quán Gió")

    await deleteLocation(db, bucket, await ownLocation(db, "u1", row.id))
    expect(await db.select().from(locations)).toHaveLength(0)
    expect((await db.select().from(files)).map((file) => file.id)).toEqual(["p1"])
    expect([...store.keys()]).toEqual(["u/u1/p1.jpg"])
  })

  test(`an account saves at most ${MAX_LOCATIONS} locations`, async () => {
    const { db, bucket, picture } = await setup()
    await picture("p1")
    await db.insert(locations).values(
      Array.from({ length: MAX_LOCATIONS }, (_, index) => ({
        id: `l${index}`,
        user_id: "u1",
        name: `Nơi ${index}`,
        created_at: index,
      })),
    )
    const error = await createLocation(db, bucket, { userID: "u1", name: "Thêm", fileIDs: ["p1"] }).catch(
      (reason: unknown) => reason,
    )
    expect(error).toMatchObject({ status: 409, code: "LOCATION_LIMIT" })
  })

  test("the legend names the place, with or without characters, and keeps it as built, not as photographed", () => {
    expect(castLegend([], 1, { name: "Phố cổ", images: 2 }).split("\n")).toEqual([
      "Reference images 1–2: Phố cổ, the place where the scene is set.",
      "Reference image 3: the picture to work from.",
      "Use the reference images of Phố cổ only for the place: keep its layout, architecture, materials, colors and light unless the prompt below changes them, and leave out any people in them. The camera may see it from another angle or distance.",
    ])
    const legend = castLegend([{ name: "Lan", images: 2 }], 0, { name: "Phố cổ", images: 1 }).split("\n")
    expect(legend.slice(0, 2)).toEqual([
      "Reference images 1–2: Lan.",
      "Reference image 3: Phố cổ, the place where the scene is set.",
    ])
    expect(legend[2]).toStartWith("Use Lan's reference images only for who they are")
    expect(legend[3]).toStartWith("Use the reference images of Phố cổ only for the place")
  })
})

describe("prepareGeneration with a location", () => {
  test("the location's photos follow the characters' and lead the pictures to work from", async () => {
    const { db, user, bucket, picture } = await setup()
    for (const id of ["a1", "a2", "l1", "l2", "scene"]) await picture(id)
    const lan = await createCharacter(db, bucket, { userID: "u1", name: "Lan", fileIDs: ["a1", "a2"] })
    const cafe = await createLocation(db, bucket, { userID: "u1", name: "Quán Gió", fileIDs: ["l1", "l2"] })
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
        prompt: "Lan ngồi đọc sách, đặt cuốn sách này lên bàn",
        referenceFileIDs: ["scene"],
        characterIDs: [lan.id],
        locationID: cafe.id,
      }),
    })

    // One photo each at least, then the picture to work from, then more of the character.
    expect(prepared.references.map((ref) => decoded(ref.image_url.url))).toEqual(["a1", "a2", "l1", "scene"])
    expect(prepared.legend.split("\n").slice(0, 3)).toEqual([
      "Reference images 1–2: Lan.",
      "Reference image 3: Quán Gió, the place where the scene is set.",
      "Reference image 4: the picture to work from.",
    ])
    expect(prepared.generation).toMatchObject({
      reference_file_ids: JSON.stringify(["scene"]),
      character_ids: JSON.stringify([lan.id]),
      location_id: cafe.id,
      // Nano Banana 1K is 2 credits, and the run reads reference pictures: +1.
      credits_reserved: 3,
    })
    expect(systems[0]).toContain('The scene is set in "Quán Gió", a saved location')
    expect(systems[0]).toContain(
      "They also attached 1 picture(s) to work from, numbered after the characters' photos and the location's photos",
    )
  })

  test("without characters the location takes the room the pictures to work from leave, and the rewrite numbers them after it", async () => {
    const { db, user, bucket, picture } = await setup()
    for (const id of ["l1", "l2", "l3", "l4", "scene"]) await picture(id)
    const street = await createLocation(db, bucket, {
      userID: "u1",
      name: "Phố cổ",
      fileIDs: ["l1", "l2", "l3", "l4"],
    })
    const systems = screener()

    const prepared = await prepareGeneration({
      db,
      bucket,
      images: fakeImages(),
      apiKey: "k",
      user,
      request: CreateGeneration.parse({
        model: "flux-3-klein",
        option: "1K",
        aspectRatio: "1:1",
        prompt: "Đặt chiếc xe đạp này giữa phố",
        referenceFileIDs: ["scene"],
        locationID: street.id,
      }),
    })

    expect(prepared.references.map((ref) => decoded(ref.image_url.url))).toEqual(["l1", "l2", "l3", "scene"])
    expect(prepared.legend.split("\n")[0]).toBe("Reference images 1–3: Phố cổ, the place where the scene is set.")
    expect(systems.asked[0]).toEqual([
      { type: "text", text: "Đặt chiếc xe đạp này giữa phố" },
      { type: "text", text: "Reference image 4:" },
      { type: "image_url", image_url: { url: `data:image/jpeg;base64,${btoa("small:scene")}` } },
    ])
    expect(systems[0]).not.toContain("The picture features")
  })

  test("past the model's limit, each character and the location keep one photo and the pictures to work from give way", async () => {
    const { db, user, bucket, picture } = await setup()
    for (const id of ["a1", "b1", "l1", "l2", "r1", "r2", "r3", "r4"]) await picture(id)
    const lan = await createCharacter(db, bucket, { userID: "u1", name: "Lan", fileIDs: ["a1"] })
    const minh = await createCharacter(db, bucket, { userID: "u1", name: "Minh", fileIDs: ["b1"] })
    const cafe = await createLocation(db, bucket, { userID: "u1", name: "Quán Gió", fileIDs: ["l1", "l2"] })
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
        locationID: cafe.id,
      }),
    })

    expect(prepared.references.map((ref) => decoded(ref.image_url.url))).toEqual(["a1", "b1", "l1", "r1"])
    expect(prepared.generation.reference_file_ids).toBe(JSON.stringify(["r1"]))
  })

  test("a location of another account cannot be used", async () => {
    const { db, user, bucket, picture } = await setup()
    await picture("x1", "u2")
    const theirs = await createLocation(db, bucket, { userID: "u2", name: "X", fileIDs: ["x1"] })
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
        locationID: theirs.id,
      }),
    }).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ status: 404, code: "LOCATION_NOT_FOUND" })
  })
})
