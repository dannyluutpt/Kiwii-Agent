import { and, eq, inArray } from "drizzle-orm"
import { ulid } from "ulid"
import { z } from "zod"
import { ApiError } from "../app"
import type { Database } from "../db/client"
import { files } from "../db/schema"
import { fileURL } from "./present"
import { IMAGE_MIMES, objectKey } from "./r2"

// Characters and locations are saved the same way: a name that goes into prompts, and one to four
// photos of their own.
export const MAX_SAVED_PHOTOS = 4
export const MAX_SAVED_NAME = 40

type Saved = { id: string; name: string; file_ids: string; created_at: number }

export const photosOf = (saved: Pick<Saved, "file_ids">) => JSON.parse(saved.file_ids) as string[]

// What the browser sees of a character or a location: its name and its photos, the first being the
// one shown for it.
export function presentSaved(saved: Saved) {
  return {
    id: saved.id,
    name: saved.name,
    images: photosOf(saved).map((fileID) => ({ fileID, url: fileURL(fileID) })),
    createdAt: saved.created_at,
  }
}

// A name goes into prompts, so it stays one plain line.
export function cleanName(name: string) {
  return name
    .replace(/["“”\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_SAVED_NAME)
}

const Name = z.string().transform(cleanName).pipe(z.string().min(1).max(MAX_SAVED_NAME))
export const CreateSaved = z.object({
  name: Name,
  // Uploaded references or generated pictures of the account; what is saved keeps its own copies.
  fileIDs: z.array(z.string().min(1).max(40)).min(1).max(MAX_SAVED_PHOTOS),
})
export const RenameSaved = z.object({ name: Name })

// Copies pictures of the account (uploads or generated pictures) into files of `kind`, in the order
// given, and returns their ids. Deleting the run a photo came from, or the cleanup of an unused
// upload, then leaves the character or location whole.
export async function copyPhotos(
  db: Database,
  bucket: R2Bucket,
  input: { userID: string; fileIDs: string[]; kind: "character" | "location" },
) {
  const ids = [...new Set(input.fileIDs)].slice(0, MAX_SAVED_PHOTOS)
  const sources = await db
    .select()
    .from(files)
    .where(and(eq(files.user_id, input.userID), inArray(files.id, ids)))
  const copies: Array<typeof files.$inferInsert> = []
  for (const id of ids) {
    const source = sources.find((file) => file.id === id)
    if (source && !IMAGE_MIMES.has(source.mime)) throw new ApiError(400, "NOT_A_PICTURE", "Chỉ lưu được ảnh")
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
      kind: input.kind,
    })
  }
  await db.insert(files).values(copies)
  return copies.map((copy) => copy.id)
}

// A character's or a location's copies of its photos, rows then objects.
export async function deletePhotos(db: Database, bucket: R2Bucket, userID: string, fileIDs: string[]) {
  const own = and(eq(files.user_id, userID), inArray(files.id, fileIDs))
  const owned = await db.select({ r2_key: files.r2_key }).from(files).where(own)
  await db.delete(files).where(own)
  // An object left behind by a failure here has no row any more, and the daily sweep removes it.
  if (owned.length) await bucket.delete(owned.map((file) => file.r2_key))
}
