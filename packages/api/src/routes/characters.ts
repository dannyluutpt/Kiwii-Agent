import { createApp } from "../app"
import { createCharacter, deleteCharacter, listCharacters, ownCharacter, renameCharacter } from "../characters/store"
import { CreateSaved, presentSaved, RenameSaved } from "../images/saved"
import { requireAuth } from "../middleware/auth"

export const characters = createApp()

characters.use("*", requireAuth)

characters.get("/", async (c) => {
  const rows = await listCharacters(c.get("db"), c.get("user").id)
  return c.json({ characters: rows.map(presentSaved) })
})

characters.post("/", async (c) => {
  const body = CreateSaved.parse(await c.req.json())
  const row = await createCharacter(c.get("db"), c.env.BUCKET, { userID: c.get("user").id, ...body })
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
