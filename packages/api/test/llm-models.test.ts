import { describe, expect, test } from "bun:test"
import { app_config } from "../src/db/schema"
import { ASSISTANT_MODEL, languageModels } from "../src/llm/models"
import { testDatabase } from "./db"

describe("languageModels", () => {
  test("uses the default, then the config for everyone, then the config for one account", async () => {
    const db = await testDatabase()
    expect(await languageModels(db, "u1")).toEqual({ assistant: ASSISTANT_MODEL, rewrite: ASSISTANT_MODEL })

    const config = { assistant: "a/everyone", accounts: { u2: { assistant: "a/u2", rewrite: "r/u2" } } }
    await db.insert(app_config).values({ key: "llm_models", value: JSON.stringify(config), updated_at: 0 })
    expect(await languageModels(db, "u1")).toEqual({ assistant: "a/everyone", rewrite: ASSISTANT_MODEL })
    expect(await languageModels(db, "u2")).toEqual({ assistant: "a/u2", rewrite: "r/u2" })
  })

  test("a broken config falls back to the default instead of breaking every request", async () => {
    const db = await testDatabase()
    await db.insert(app_config).values({ key: "llm_models", value: "{not json", updated_at: 0 })
    expect(await languageModels(db, "u1")).toEqual({ assistant: ASSISTANT_MODEL, rewrite: ASSISTANT_MODEL })
  })
})
