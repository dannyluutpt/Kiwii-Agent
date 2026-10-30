import { and, desc, eq, sql } from "drizzle-orm"
import { ulid } from "ulid"
import { ApiError } from "../app"
import type { Database } from "../db/client"
import { locations } from "../db/schema"
import { copyPhotos, deletePhotos, photosOf } from "../images/saved"

export type Location = typeof locations.$inferSelect

export const MAX_LOCATIONS = 50

export function listLocations(db: Database, userID: string) {
  return db.select().from(locations).where(eq(locations.user_id, userID)).orderBy(desc(locations.created_at))
}

export async function ownLocation(db: Database, userID: string, id: string) {
  const row = await db
    .select()
    .from(locations)
    .where(and(eq(locations.id, id), eq(locations.user_id, userID)))
    .get()
  if (!row) throw new ApiError(404, "LOCATION_NOT_FOUND", "Không tìm thấy bối cảnh")
  return row
}

// Saves a place from pictures of the account: uploads or generated pictures, of which it keeps its
// own copies.
export async function createLocation(
  db: Database,
  bucket: R2Bucket,
  input: { userID: string; name: string; fileIDs: string[] },
) {
  const saved = await db
    .select({ count: sql<number>`count(*)` })
    .from(locations)
    .where(eq(locations.user_id, input.userID))
    .get()
  if ((saved?.count ?? 0) >= MAX_LOCATIONS) {
    throw new ApiError(409, "LOCATION_LIMIT", `Mỗi tài khoản lưu được tối đa ${MAX_LOCATIONS} bối cảnh`)
  }
  // The copies first: a location never lists photos that are not there.
  const fileIDs = await copyPhotos(db, bucket, { userID: input.userID, fileIDs: input.fileIDs, kind: "location" })
  const row = {
    id: ulid(),
    user_id: input.userID,
    name: input.name,
    file_ids: JSON.stringify(fileIDs),
    created_at: Date.now(),
  }
  await db.insert(locations).values(row)
  return row
}

export async function renameLocation(db: Database, location: Location, name: string) {
  await db.update(locations).set({ name }).where(eq(locations.id, location.id))
  return { ...location, name }
}

// The location and its copies of the photos go. Runs set in it keep their pictures.
export async function deleteLocation(db: Database, bucket: R2Bucket, location: Location) {
  await db.delete(locations).where(eq(locations.id, location.id))
  await deletePhotos(db, bucket, location.user_id, photosOf(location))
}
