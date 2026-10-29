import { z } from "zod"
import { createApp } from "../app"
import { requireAuth } from "../middleware/auth"
import {
  createProject,
  deleteProject,
  listProjects,
  MAX_PROJECT_NAME,
  ownProject,
  presentProject,
  renameProject,
} from "../projects/store"

// A new project may start without a name; its first run names it after the prompt.
const Create = z.object({ name: z.string().trim().max(MAX_PROJECT_NAME).default("") })
const Rename = z.object({ name: z.string().trim().min(1).max(MAX_PROJECT_NAME) })

export const projects = createApp()

projects.use("*", requireAuth)

projects.get("/", async (c) => {
  const rows = await listProjects(c.get("db"), c.get("user").id)
  return c.json({ projects: rows.map(presentProject) })
})

projects.post("/", async (c) => {
  const body = Create.parse(await c.req.json().catch(() => ({})))
  const project = await createProject(c.get("db"), { userID: c.get("user").id, name: body.name })
  return c.json(presentProject(project), 201)
})

projects.patch("/:id", async (c) => {
  const body = Rename.parse(await c.req.json())
  const db = c.get("db")
  const project = await ownProject(db, c.get("user").id, c.req.param("id"))
  return c.json(presentProject(await renameProject(db, project, body.name)))
})

projects.delete("/:id", async (c) => {
  const db = c.get("db")
  await deleteProject(db, await ownProject(db, c.get("user").id, c.req.param("id")))
  return c.json({ ok: true })
})
