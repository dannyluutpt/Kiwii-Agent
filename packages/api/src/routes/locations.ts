import { createApp } from "../app"
import { CreateSaved, presentSaved, RenameSaved } from "../images/saved"
import { createLocation, deleteLocation, listLocations, ownLocation, renameLocation } from "../locations/store"
import { requireAuth } from "../middleware/auth"

export const locations = createApp()

locations.use("*", requireAuth)

locations.get("/", async (c) => {
  const rows = await listLocations(c.get("db"), c.get("user").id)
  return c.json({ locations: rows.map(presentSaved) })
})

locations.post("/", async (c) => {
  const body = CreateSaved.parse(await c.req.json())
  const row = await createLocation(c.get("db"), c.env.BUCKET, { userID: c.get("user").id, ...body })
  return c.json(presentSaved(row), 201)
})

locations.patch("/:id", async (c) => {
  const body = RenameSaved.parse(await c.req.json())
  const db = c.get("db")
  const location = await ownLocation(db, c.get("user").id, c.req.param("id"))
  return c.json(presentSaved(await renameLocation(db, location, body.name)))
})

locations.delete("/:id", async (c) => {
  const db = c.get("db")
  await deleteLocation(db, c.env.BUCKET, await ownLocation(db, c.get("user").id, c.req.param("id")))
  return c.json({ ok: true })
})
