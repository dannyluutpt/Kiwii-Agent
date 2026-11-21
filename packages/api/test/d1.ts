import { Database as SQLite } from "bun:sqlite"
import type { Env } from "../src/env"
import worker from "../src/index"

// Enough of D1's interface over an in-memory SQLite for drizzle's D1 driver, so a test can call the
// app over HTTP with the real routes, middleware and migrations. A batch is one transaction, as on D1.
export async function testD1() {
  const sqlite = new SQLite(":memory:")
  const dir = new URL("../migration/", import.meta.url)
  const files = (await Array.fromAsync(new Bun.Glob("*.sql").scan({ cwd: dir.pathname }))).sort()
  for (const file of files) {
    const text = await Bun.file(new URL(file, dir)).text()
    for (const statement of text.split("--> statement-breakpoint")) {
      if (statement.trim()) sqlite.run(statement)
    }
  }
  type Value = string | number | bigint | boolean | null | Uint8Array
  const statement = (sql: string, params: Value[] = []) => ({
    bind: (...values: Value[]) => statement(sql, values),
    all: async () => ({ results: sqlite.query(sql).all(...params), success: true, meta: {} }),
    raw: async () => sqlite.query(sql).values(...params),
    first: async () => sqlite.query(sql).get(...params),
    run: async () => {
      const done = sqlite.query(sql).run(...params)
      return { results: [], success: true, meta: { changes: done.changes, last_row_id: done.lastInsertRowid } }
    },
  })
  const d1 = {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: ReturnType<typeof statement>[]) => {
      sqlite.run("begin")
      const results = []
      for (const item of statements) {
        const result = await item.all().catch((error: unknown) => {
          sqlite.run("rollback")
          throw error
        })
        results.push(result)
      }
      sqlite.run("commit")
      return results
    },
  }
  return { sqlite, d1: d1 as unknown as D1Database }
}

// The app with that database, every email it sends collected in `outbox`, and a cookie jar, so a test
// reads like a visit: `await site.post("/api/auth/login", {...})`.
export async function testSite(vars: Partial<Env> = {}) {
  const { sqlite, d1 } = await testD1()
  const outbox: Array<{ to: string; subject: string; text: string }> = []
  const env = {
    APP_URL: "https://amberpix.com",
    EMAIL_FROM: "Amberpix <no-reply@amberpix.com>",
    DB: d1,
    EMAIL: {
      send: async (message: { to: string; subject: string; text: string }) => {
        outbox.push(message)
        return {}
      },
    },
    RL_IP: { limit: async () => ({ success: true }) },
    RL_AUTH: { limit: async () => ({ success: true }) },
    ASSETS: { fetch: async () => new Response("<!doctype html>", { headers: { "content-type": "text/html" } }) },
    ...vars,
  } as unknown as Env
  const ctx = { waitUntil: () => {}, passThroughOnException: () => {} } as unknown as ExecutionContext
  const visitor = () => {
    let cookie = ""
    const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
      const res = await worker.fetch(
        new Request(`https://amberpix.com${path}`, {
          method,
          headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...headers },
          body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
        }),
        env,
        ctx,
      )
      const set = res.headers.get("set-cookie")
      if (set) cookie = set.split(";")[0] ?? ""
      return res
    }
    return {
      request: (method: string, path: string, body?: unknown) => call(method, path, body),
      get: (path: string) => call("GET", path),
      post: (path: string, body?: unknown, headers?: Record<string, string>) => call("POST", path, body, headers),
    }
  }
  return { sqlite, env, outbox, visitor, ...visitor() }
}
