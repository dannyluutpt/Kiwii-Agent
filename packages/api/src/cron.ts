import { and, eq, lt } from "drizzle-orm"
import { expireSubscriptions } from "./billing/activate"
import { expireGrants } from "./credits/ledger"
import { createDatabase } from "./db/client"
import { password_resets, pending_signups, plan_orders, sessions } from "./db/schema"
import type { Env } from "./env"
import { removeUnusedReferences, sweepOrphans } from "./images/cleanup"
import { reapStaleGenerations } from "./images/generate"

// Runs daily at 00:00 Asia/Ho_Chi_Minh (see wrangler.jsonc). Every step is idempotent.
export async function runDaily(env: Env) {
  const db = createDatabase(env.DB)
  const now = Date.now()
  await db.batch([
    db.delete(pending_signups).where(lt(pending_signups.expires_at, now)),
    db.delete(password_resets).where(lt(password_resets.expires_at, now)),
    db.delete(sessions).where(lt(sessions.expires_at, now)),
    db
      .update(plan_orders)
      .set({ status: "expired" })
      .where(and(eq(plan_orders.status, "pending"), lt(plan_orders.expires_at, now))),
  ])
  const grants = await expireGrants(db, now)
  const subs = await expireSubscriptions(db, now)
  const stale = await reapStaleGenerations(db, now)
  const references = await removeUnusedReferences(db, env.BUCKET, now)
  const orphans = await sweepOrphans(db, env.BUCKET, now)
  console.log(
    `[cron] expired grants=${grants} subscriptions=${subs} stale generations=${stale} unused references=${references} orphaned pictures=${orphans}`,
  )
}
