import { and, eq, gt } from "drizzle-orm"
import type { Database } from "../db/client"
import { plan_orders } from "../db/schema"

// A still-payable order for the same item, so reopening checkout keeps the memo the customer may
// already have typed. An order past its deadline keeps status "pending" until something marks it,
// so the deadline is checked here too; otherwise it would be picked and every visit minted a new one.
export async function openOrder(db: Database, userID: string, itemID: string, now = Date.now()) {
  return db
    .select()
    .from(plan_orders)
    .where(
      and(
        eq(plan_orders.user_id, userID),
        eq(plan_orders.status, "pending"),
        eq(plan_orders.item_id, itemID),
        gt(plan_orders.expires_at, now),
      ),
    )
    .get()
}
