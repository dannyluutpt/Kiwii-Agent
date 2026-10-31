import { z } from "zod"
import { ApiError, createApp } from "../app"
import { CHARACTER_SHEET, characterFromSheet, characterSheetPrompt, SheetStyle } from "../characters/sheet"
import { createCharacter, deleteCharacter, listCharacters, ownCharacter, renameCharacter } from "../characters/store"
import { CreateGeneration, prepareGeneration } from "../images/prepare"
import { CreateSaved, presentSaved, RenameSaved, SaveFromSheet } from "../images/saved"
import { streamGeneration } from "../images/stream"
import { requireAuth } from "../middleware/auth"

export const characters = createApp()

characters.use("*", requireAuth)

const CreateSheet = z.object({
  description: z.string().trim().min(1).max(1500),
  style: z.enum(SheetStyle).default("photo"),
})

characters.get("/", async (c) => {
  const rows = await listCharacters(c.get("db"), c.get("user").id)
  return c.json({ characters: rows.map(presentSaved) })
})

characters.post("/", async (c) => {
  const body = CreateSaved.parse(await c.req.json())
  const row = await createCharacter(c.get("db"), c.env.BUCKET, { userID: c.get("user").id, ...body })
  return c.json(presentSaved(row), 201)
})

// A character sheet from a description: one picture of the face and four full-body views, at the
// price of one picture. It streams like a run from the studio and shows in the Library.
characters.post("/sheets", async (c) => {
  const body = CreateSheet.parse(await c.req.json())
  const apiKey = c.env.OPENROUTER_API_KEY
  if (!apiKey) throw new ApiError(500, "LLM_NOT_CONFIGURED", "Thiếu OPENROUTER_API_KEY")
  const prepared = await prepareGeneration({
    db: c.get("db"),
    bucket: c.env.BUCKET,
    images: c.env.IMAGES,
    apiKey,
    baseURL: c.env.OPENROUTER_BASE_URL,
    user: c.get("user"),
    request: CreateGeneration.parse({ ...CHARACTER_SHEET, n: 1, prompt: body.description, enhance: false }),
    sheet: { kind: "character", prompt: (description) => characterSheetPrompt(description, body.style) },
  })
  return streamGeneration(c, prepared, apiKey)
})

// Saves a character from a sheet picture, its face and front view cut out of it.
characters.post("/from-sheet", async (c) => {
  const body = SaveFromSheet.parse(await c.req.json())
  const row = await characterFromSheet(c.get("db"), c.env.BUCKET, c.env.IMAGES, {
    userID: c.get("user").id,
    ...body,
  })
  return c.json(presentSaved(row), 201)
})

characters.patch("/:id", async (c) => {
  const body = RenameSaved.parse(await c.req.json())
  const db = c.get("db")
  const character = await ownCharacter(db, c.get("user").id, c.req.param("id"))
  return c.json(presentSaved(await renameCharacter(db, character, body.name)))
})

characters.delete("/:id", async (c) => {
  const db = c.get("db")
  await deleteCharacter(db, c.env.BUCKET, await ownCharacter(db, c.get("user").id, c.req.param("id")))
  return c.json({ ok: true })
})
