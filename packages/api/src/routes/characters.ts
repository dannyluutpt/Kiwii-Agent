import { z } from "zod"
import { createApp } from "../app"
import {
  cleanName,
  createCharacter,
  deleteCharacter,
  listCharacters,
  MAX_CHARACTER_NAME,
  MAX_CHARACTER_PHOTOS,
  ownCharacter,
  presentCharacter,
  renameCharacter,
} from "../characters/store"
import { requireAuth } from "../middleware/auth"

const Name = z.string().transform(cleanName).pipe(z.string().min(1).max(MAX_CHARACTER_NAME))
const Create = z.object({
  name: Name,
  // Uploaded references or generated pictures of the account; the character keeps its own copies.
  fileIDs: z.array(z.string().min(1).max(40)).min(1).max(MAX_CHARACTER_PHOTOS),
})
const Rename = z.object({ name: Name })

export const characters = createApp()

characters.use("*", requireAuth)

characters.get("/", async (c) => {
  const rows = await listCharacters(c.get("db"), c.get("user").id)
  return c.json({ characters: rows.map(presentCharacter) })
})

characters.post("/", async (c) => {
  const body = Create.parse(await c.req.json())
  const row = await createCharacter(c.get("db"), c.env.BUCKET, { userID: c.get("user").id, ...body })
  return c.json(presentCharacter(row), 201)
})

characters.patch("/:id", async (c) => {
  const body = Rename.parse(await c.req.json())
  const db = c.get("db")
  const character = await ownCharacter(db, c.get("user").id, c.req.param("id"))
  return c.json(presentCharacter(await renameCharacter(db, character, body.name)))
})

characters.delete("/:id", async (c) => {
  const db = c.get("db")
  await deleteCharacter(db, c.env.BUCKET, await ownCharacter(db, c.get("user").id, c.req.param("id")))
  return c.json({ ok: true })
})
