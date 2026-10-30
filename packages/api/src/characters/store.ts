import { and, desc, eq, inArray, sql } from "drizzle-orm"
import { ulid } from "ulid"
import { ApiError } from "../app"
import type { Database } from "../db/client"
import { characters } from "../db/schema"
import { copyPhotos, deletePhotos, MAX_SAVED_PHOTOS, photosOf } from "../images/saved"

export type Character = typeof characters.$inferSelect

export const MAX_CHARACTERS = 50
// Characters one run may feature.
export const MAX_CHARACTERS_PER_RUN = 2

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

// Saves a character from pictures of the account: uploads or generated pictures, of which it keeps
// its own copies.
export async function createCharacter(
  db: Database,
  bucket: R2Bucket,
  input: { userID: string; name: string; fileIDs: string[] },
) {
  await ensureCharacterRoom(db, input.userID)
  // The copies first: a character never lists photos that are not there.
  const fileIDs = await copyPhotos(db, bucket, { userID: input.userID, fileIDs: input.fileIDs, kind: "character" })
  return insertCharacter(db, { userID: input.userID, name: input.name, fileIDs })
}

// Throws while the account holds as many characters as it may.
export async function ensureCharacterRoom(db: Database, userID: string) {
  const saved = await db
    .select({ count: sql<number>`count(*)` })
    .from(characters)
    .where(eq(characters.user_id, userID))
    .get()
  if ((saved?.count ?? 0) >= MAX_CHARACTERS) {
    throw new ApiError(409, "CHARACTER_LIMIT", `Mỗi tài khoản lưu được tối đa ${MAX_CHARACTERS} nhân vật`)
  }
}

// The character's row, once its photos are files of kind "character" of the account.
export async function insertCharacter(db: Database, input: { userID: string; name: string; fileIDs: string[] }) {
  const row = {
    id: ulid(),
    user_id: input.userID,
    name: input.name,
    file_ids: JSON.stringify(input.fileIDs),
    created_at: Date.now(),
  }
  await db.insert(characters).values(row)
  return row
}

export async function renameCharacter(db: Database, character: Character, name: string) {
  await db.update(characters).set({ name }).where(eq(characters.id, character.id))
  return { ...character, name }
}

// The character and its copies of the photos go. Runs that featured it keep their pictures.
export async function deleteCharacter(db: Database, bucket: R2Bucket, character: Character) {
  await db.delete(characters).where(eq(characters.id, character.id))
  await deletePhotos(db, bucket, character.user_id, photosOf(character))
}

// The photos each character brings to a run: one each at least, then more in turn while the run has
// `room` for them after the pictures it works from.
export function castPhotos(cast: Character[], room: number) {
  const photos = cast.map(photosOf)
  const counts = photos.map(() => 0)
  let left = Math.max(cast.length, room)
  for (let round = 0; round < MAX_SAVED_PHOTOS; round++) {
    for (const [index, list] of photos.entries()) {
      if (left === 0 || !list[round]) continue
      counts[index] = (counts[index] ?? 0) + 1
      left -= 1
    }
  }
  return photos.map((list, index) => list.slice(0, counts[index]))
}
