import { and, eq, inArray, lt, sql } from "drizzle-orm"
import type { Database } from "../db/client"
import { app_config, files } from "../db/schema"

const DAY = 24 * 60 * 60 * 1000
// D1 takes at most 100 bound parameters in one statement.
const BATCH = 100

function batches<T>(items: T[]) {
  return Array.from({ length: Math.ceil(items.length / BATCH) }, (_, i) => items.slice(i * BATCH, (i + 1) * BATCH))
}

// A reference picture nobody uses any more: a week after its upload, no run took it (as a reference
// or as a clip's last frame) and no conversation shows it. A picture kept in the composer that long
// without a run goes too.
export async function removeUnusedReferences(db: Database, bucket: R2Bucket, now = Date.now()) {
  const rows = await db
    .select({ id: files.id, key: files.r2_key })
    .from(files)
    .where(
      and(
        eq(files.kind, "reference"),
        lt(files.created_at, now - 7 * DAY),
        sql`not exists (select 1 from generations g where g.user_id = ${files.user_id} and (g.reference_file_ids like '%' || ${files.id} || '%' or g.last_frame_file_id = ${files.id}))`,
        sql`not exists (select 1 from project_messages m where m.user_id = ${files.user_id} and m.parts like '%' || ${files.id} || '%')`,
      ),
    )
    .limit(500)
  if (rows.length === 0) return 0
  await bucket.delete(rows.map((row) => row.key))
  for (const ids of batches(rows.map((row) => row.id))) await db.delete(files).where(inArray(files.id, ids))
  return rows.length
}

// Pictures in R2 whose files row is gone, such as those of an account removed by hand. The bucket
// is walked a few pages a day, picking up after the last key it saw, and an object goes once it is
// two days old, so an upload whose row is still being written is never touched.
export async function sweepOrphans(db: Database, bucket: R2Bucket, now = Date.now(), pages = 5) {
  const saved = await db
    .select({ value: app_config.value })
    .from(app_config)
    .where(eq(app_config.key, "r2_sweep_after"))
    .get()
  let after = saved?.value || undefined
  let removed = 0
  for (let page = 0; page < pages; page++) {
    const listing = await bucket.list({ prefix: "u/", startAfter: after, limit: 1000 })
    const old = listing.objects
      .filter((object) => object.uploaded.getTime() < now - 2 * DAY)
      .map((object) => object.key)
    const known = new Set<string>()
    for (const keys of batches(old)) {
      const rows = await db.select({ key: files.r2_key }).from(files).where(inArray(files.r2_key, keys))
      for (const row of rows) known.add(row.key)
    }
    const orphans = old.filter((key) => !known.has(key))
    if (orphans.length) await bucket.delete(orphans)
    removed += orphans.length
    after = listing.truncated ? listing.objects.at(-1)?.key : undefined
    if (!after) break
  }
  await db
    .insert(app_config)
    .values({ key: "r2_sweep_after", value: after ?? "", updated_at: now })
    .onConflictDoUpdate({ target: app_config.key, set: { value: after ?? "", updated_at: now } })
  return removed
}
