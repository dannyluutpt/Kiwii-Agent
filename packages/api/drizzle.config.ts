import { defineConfig } from "drizzle-kit"

// `bun db:generate` writes a timestamped folder under ./drizzle. Copy its migration.sql into
// ./migration as the next `NNNN_name.sql`; wrangler applies that flat directory to D1.
export default defineConfig({
  dialect: "sqlite",
  driver: "d1-http",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
})
