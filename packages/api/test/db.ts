import { createDatabase } from "../src/db/client"
import { testD1 } from "./d1"

// The migration files are the schema's source of truth, so tests run them against an in-memory
// SQLite behind D1's interface (test/d1.ts) and use the same drizzle driver as the Worker.
export async function testDatabase() {
  const { d1 } = await testD1()
  return createDatabase(d1)
}
