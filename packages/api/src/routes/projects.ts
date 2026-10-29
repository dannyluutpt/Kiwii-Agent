import { asc, desc, eq, inArray } from "drizzle-orm"
import { streamSSE } from "hono/streaming"
import { z } from "zod"
import { ApiError, createApp } from "../app"
import { presentMessage } from "../assistant/parts"
import { AssistantRequest, checkAssistant, runAssistantTurn, type AssistantEvent } from "../assistant/turn"
import { generation_images, generations, project_messages } from "../db/schema"
import { presentGeneration } from "../images/present"
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

// The conversation a project's panel opens with.
const MESSAGES_SHOWN = 60

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

// The latest turns of the project's conversation, oldest first, with every run they mention.
projects.get("/:id/messages", async (c) => {
  const db = c.get("db")
  const project = await ownProject(db, c.get("user").id, c.req.param("id"))
  const rows = (
    await db
      .select()
      .from(project_messages)
      .where(eq(project_messages.project_id, project.id))
      .orderBy(desc(project_messages.created_at), desc(project_messages.id))
      .limit(MESSAGES_SHOWN)
  ).reverse()
  const messages = rows.map(presentMessage)
  const ids = messages.flatMap((m) => m.parts.flatMap((part) => (part.type === "generation" ? [part.id] : [])))
  const runs = ids.length ? await db.select().from(generations).where(inArray(generations.id, ids)) : []
  const images = ids.length
    ? await db
        .select()
        .from(generation_images)
        .where(inArray(generation_images.generation_id, ids))
        .orderBy(asc(generation_images.position))
    : []
  return c.json({
    messages,
    generations: runs.map((run) =>
      presentGeneration(
        run,
        images.filter((image) => image.generation_id === run.id),
      ),
    ),
  })
})

// A message to the project's image assistant, answered as a stream of events (assistant/turn.ts).
projects.post("/:id/messages", async (c) => {
  const request = AssistantRequest.parse(await c.req.json())
  const db = c.get("db")
  const user = c.get("user")
  const apiKey = c.env.OPENROUTER_API_KEY
  if (!apiKey) throw new ApiError(500, "LLM_NOT_CONFIGURED", "Thiếu OPENROUTER_API_KEY")
  const project = await ownProject(db, user.id, c.req.param("id"))
  const access = await checkAssistant(db, user, request)

  return streamSSE(c, async (stream) => {
    let closed = false
    stream.onAbort(() => {
      closed = true
    })
    const emit = async (event: AssistantEvent) => {
      if (closed) return
      await stream.writeSSE({ event: event.type, data: JSON.stringify(event) }).catch(() => {
        closed = true
      })
    }
    const job = runAssistantTurn({
      db,
      bucket: c.env.BUCKET,
      apiKey,
      baseURL: c.env.OPENROUTER_BASE_URL,
      user,
      project,
      parallel: access.parallelLimit,
      request,
      emit,
    }).catch(async (error: unknown) => {
      console.error("[assistant]", error)
      await emit({ type: "error", message: "Trợ lý gặp lỗi, hãy thử lại" })
    })
    // The reply and the runs it started finish even if the browser leaves mid-way.
    c.executionCtx.waitUntil(job)
    await job
  })
})
