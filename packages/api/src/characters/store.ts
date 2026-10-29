import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { ulid } from "ulid"
import { ApiError } from "../app"
import type { Database } from "../db/client"
import { characters, files } from "../db/schema"
import { fileURL } from "../images/present"
import { IMAGE_MIMES, objectKey } from "../images/r2"

export type Character = typeof characters.$inferSelect

export const MAX_CHARACTERS = 50
export const MAX_CHARACTER_PHOTOS = 4
export const MAX_CHARACTER_NAME = 40
// Characters one run may feature.
export const MAX_CHARACTERS_PER_RUN = 2

export const photosOf = (character: Character) => JSON.parse(character.file_ids) as string[]

// What the browser sees of a character: its name and its photos, the first being its face.
export function presentCharacter(character: Character) {
  return {
    id: character.id,
    name: character.name,
    images: photosOf(character).map((fileID) => ({ fileID, url: fileURL(fileID) })),
    createdAt: character.created_at,
  }
}

// A name goes into prompts, so it stays one plain line.
export function cleanName(name: string) {
  return name
    .replace(/["“”\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_CHARACTER_NAME)
}

export function listCharacters(db: Database, userID: string) {
  return db.select().from(characters).where(eq(characters.user_id, userID)).orderBy(desc(characters.created_at))
}

export async function ownCharacter(db: Database, userID: string, id: string) {
  const row = await db
    .select()
    .from(characters)
    .where(and(eq(characters.id, id), eq(characters.user_id, userID)))
    .get()
  if (!row) throw new ApiError(404, "CHARACTER_NOT_FOUND", "Không tìm thấy nhân vật")
  return row
}

// The characters of a run, in the order asked.
export async function ownCharacters(db: Database, userID: string, ids: string[]) {
  if (ids.length === 0) return []
  const rows = await db
    .select()
    .from(characters)
    .where(and(eq(characters.user_id, userID), inArray(characters.id, ids)))
  const found = ids.flatMap((id) => rows.filter((row) => row.id === id))
  if (found.length !== ids.length) throw new ApiError(404, "CHARACTER_NOT_FOUND", "Không tìm thấy nhân vật")
  return found
}

// Saves a character from pictures of the account: uploads or generated pictures. Each photo is copied,
// so deleting the run it came from, or the cleanup of an unused upload, leaves the character whole.
export async function createCharacter(
  db: Database,
  bucket: R2Bucket,
  input: { userID: string; name: string; fileIDs: string[] },
) {
  const saved = await db
    .select({ count: sql<number>`count(*)` })
    .from(characters)
    .where(eq(characters.user_id, input.userID))
    .get()
  if ((saved?.count ?? 0) >= MAX_CHARACTERS) {
    throw new ApiError(409, "CHARACTER_LIMIT", `Mỗi tài khoản lưu được tối đa ${MAX_CHARACTERS} nhân vật`)
  }
  const ids = [...new Set(input.fileIDs)].slice(0, MAX_CHARACTER_PHOTOS)
  const sources = await db
    .select()
    .from(files)
    .where(and(eq(files.user_id, input.userID), inArray(files.id, ids)))
  const copies: Array<typeof files.$inferInsert> = []
  for (const id of ids) {
    const source = sources.find((file) => file.id === id)
    if (source && !IMAGE_MIMES.has(source.mime)) throw new ApiError(400, "NOT_A_PICTURE", "Nhân vật chỉ dùng được ảnh")
    const object = source && (await bucket.get(source.r2_key))
    if (!source || !object) throw new ApiError(404, "FILE_NOT_FOUND", "Không tìm thấy ảnh")
    const key = objectKey(input.userID, source.mime)
    await bucket.put(key, await object.arrayBuffer(), { httpMetadata: { contentType: source.mime } })
    copies.push({
      id: ulid(),
      user_id: input.userID,
      r2_key: key,
      name: source.name,
      mime: source.mime,
      size: source.size,
      kind: "character",
    })
  }
  const row = {
    id: ulid(),
    user_id: input.userID,
    name: input.name,
    file_ids: JSON.stringify(copies.map((copy) => copy.id)),
    created_at: Date.now(),
  }
  // The copies first: a character never lists photos that are not there.
  await db.insert(files).values(copies)
  await db.insert(characters).values(row)
  return row
}

export async function renameCharacter(db: Database, character: Character, name: string) {
  await db.update(characters).set({ name }).where(eq(characters.id, character.id))
  return { ...character, name }
}

// The character and its copies of the photos go. Runs that featured it keep their pictures.
export async function deleteCharacter(db: Database, bucket: R2Bucket, character: Character) {
  const own = and(eq(files.user_id, character.user_id), inArray(files.id, photosOf(character)))
  const owned = await db.select({ r2_key: files.r2_key }).from(files).where(own)
  await db.delete(characters).where(eq(characters.id, character.id))
  await db.delete(files).where(own)
  // An object left behind by a failure here has no row any more, and the daily sweep removes it.
  if (owned.length) await bucket.delete(owned.map((file) => file.r2_key))
}

// The photos each character brings to a run: one each at least, then more in turn while the run has
// `room` for them after the pictures it works from.
export function castPhotos(cast: Character[], room: number) {
  const photos = cast.map(photosOf)
  const counts = photos.map(() => 0)
  let left = Math.max(cast.length, room)
  for (let round = 0; round < MAX_CHARACTER_PHOTOS; round++) {
    for (const [index, list] of photos.entries()) {
      if (left === 0 || !list[round]) continue
      counts[index] = (counts[index] ?? 0) + 1
      left -= 1
    }
  }
  return photos.map((list, index) => list.slice(0, counts[index]))
}
