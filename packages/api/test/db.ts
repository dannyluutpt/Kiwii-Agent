import { Database as SQLite } from "bun:sqlite"
import { drizzle } from "drizzle-orm/bun-sqlite"
import * as schema from "../src/db/schema"
import type { Database } from "../src/db/client"

// The migration files are the schema's source of truth, so tests run them against an in-memory
// SQLite and pretend the result is D1. The query API of both drizzle drivers is the same.
export async function testDatabase() {
  const sqlite = new SQLite(":memory:")
  const dir = new URL("../migration/", import.meta.url)
  const files = (await Array.fromAsync(new Bun.Glob("*.sql").scan({ cwd: dir.pathname }))).sort()
  for (const file of files) {
    const text = await Bun.file(new URL(file, dir)).text()
    for (const statement of text.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.run(statement)
    }
  }
  // drizzle 1.0 treats a bare first argument as a connection string and opens its own database.
  return drizzle({ client: sqlite, schema }) as unknown as Database
}
