import { describe, expect, test } from "bun:test"
import { eq } from "drizzle-orm"
import { app_config, files, generations, project_messages, projects } from "../src/db/schema"
import { removeUnusedReferences, sweepOrphans } from "../src/images/cleanup"
import { testDatabase } from "./db"

const DAY = 24 * 60 * 60 * 1000
const NOW = 1_800_000_000_000

// An R2 bucket in memory: listing in key order, `pageSize` objects at a time, after a given key.
function fakeBucket(objects: Array<{ key: string; uploaded: number }>, pageSize = 1000) {
  const store = new Map(objects.map((object) => [object.key, object.uploaded]))
  const bucket = {
    async delete(keys: string | string[]) {
      for (const key of [keys].flat()) store.delete(key)
    },
    async list(options: { prefix?: string; startAfter?: string; limit?: number }) {
      const keys = [...store.keys()]
        .filter((key) => key.startsWith(options.prefix ?? "") && key > (options.startAfter ?? ""))
        .sort()
      const page = keys.slice(0, Math.min(options.limit ?? 1000, pageSize))
      return {
        objects: page.map((key) => ({ key, uploaded: new Date(store.get(key)!) })),
        truncated: keys.length > page.length,
      }
    },
  } as unknown as R2Bucket
  return { store, bucket }
}

const file = (id: string, kind: "reference" | "image" | "character", age: number) => ({
  id,
  user_id: "u1",
  r2_key: `u/u1/${id}.jpg`,
  name: id,
  mime: "image/jpeg",
  size: 1,
  kind,
  created_at: NOW - age,
})

describe("removeUnusedReferences", () => {
  test("drops week-old references no run or conversation uses, and keeps the rest", async () => {
    const db = await testDatabase()
    await db.insert(files).values([
      file("UNUSED", "reference", 8 * DAY),
      file("INRUN", "reference", 8 * DAY),
      file("INCHAT", "reference", 8 * DAY),
      file("FRESH", "reference", 1 * DAY),
      file("OUTPUT", "image", 30 * DAY),
      // A character's copy of a photo is never a leftover upload.
      file("FACE", "character", 30 * DAY),
    ])
    await db.insert(generations).values({
      id: "G1",
      user_id: "u1",
      status: "done",
      model: "flux-3-klein",
      option: "1K",
      aspect_ratio: "1:1",
      n: 1,
      prompt_raw: "x",
      reference_file_ids: JSON.stringify(["INRUN"]),
      credits_reserved: 1,
      created_at: NOW,
      updated_at: NOW,
    })
    await db.insert(projects).values({ id: "P1", user_id: "u1", created_at: NOW, updated_at: NOW })
    await db.insert(project_messages).values({
      id: "M1",
      project_id: "P1",
      user_id: "u1",
      role: "user",
      parts: JSON.stringify([{ type: "image", fileID: "INCHAT" }]),
      created_at: NOW,
      updated_at: NOW,
    })
    const { store, bucket } = fakeBucket(
      ["UNUSED", "INRUN", "INCHAT", "FRESH", "OUTPUT", "FACE"].map((id) => ({ key: `u/u1/${id}.jpg`, uploaded: NOW })),
    )

    expect(await removeUnusedReferences(db, bucket, NOW)).toBe(1)
    expect([...store.keys()].sort()).toEqual([
      "u/u1/FACE.jpg",
      "u/u1/FRESH.jpg",
      "u/u1/INCHAT.jpg",
      "u/u1/INRUN.jpg",
      "u/u1/OUTPUT.jpg",
    ])
    const left = await db.select({ id: files.id }).from(files)
    expect(left.map((row) => row.id).sort()).toEqual(["FACE", "FRESH", "INCHAT", "INRUN", "OUTPUT"])
  })
})

describe("sweepOrphans", () => {
  test("deletes old pictures without a files row, a page at a time, and starts over after the last", async () => {
    const db = await testDatabase()
    await db.insert(files).values(file("KEPT", "image", 10 * DAY))
    const { store, bucket } = fakeBucket(
      [
        { key: "u/u1/KEPT.jpg", uploaded: NOW - 10 * DAY },
        { key: "u/u1/LOST.jpg", uploaded: NOW - 10 * DAY },
        { key: "u/u2/LOST.jpg", uploaded: NOW - 3 * DAY },
        { key: "u/u2/NEW.jpg", uploaded: NOW - 1 * DAY },
      ],
      2,
    )

    // Two objects a page and one page a run: the first run stops after u/u1/LOST.jpg and remembers
    // it, the second picks up there, reaches the end and leaves the next run to start over.
    expect(await sweepOrphans(db, bucket, NOW, 1)).toBe(1)
    expect(await sweepOrphans(db, bucket, NOW, 1)).toBe(1)
    expect([...store.keys()].sort()).toEqual(["u/u1/KEPT.jpg", "u/u2/NEW.jpg"])
    const cursor = await db
      .select({ value: app_config.value })
      .from(app_config)
      .where(eq(app_config.key, "r2_sweep_after"))
      .get()
    expect(cursor?.value).toBe("")
  })
})
