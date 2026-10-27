import { Hono } from "hono"
import type { Database } from "./db/client"
import type { users } from "./db/schema"
import type { Env } from "./env"

export type User = typeof users.$inferSelect

export type AppEnv = {
  Bindings: Env
  Variables: {
    db: Database
    user: User
  }
}

export const createApp = () => new Hono<AppEnv>()

export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 402 | 403 | 404 | 409 | 422 | 429 | 500 | 502,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message)
  }
}
