import { and, desc, eq, notExists } from "drizzle-orm"
import { ulid } from "ulid"
import { ApiError } from "../app"
import type { Database } from "../db/client"
import { generations, project_messages, projects } from "../db/schema"

export type Project = typeof projects.$inferSelect

export const MAX_PROJECT_NAME = 80
const NAME_FROM_PROMPT = 48

// What the browser sees of a project. An empty name means "not named yet".
export function presentProject(project: Project) {
  return { id: project.id, name: project.name, createdAt: project.created_at, updatedAt: project.updated_at }
}

export function listProjects(db: Database, userID: string) {
  return db.select().from(projects).where(eq(projects.user_id, userID)).orderBy(desc(projects.updated_at))
}

// "New project" pressed again while an unnamed project still has no run opens that one rather than
// piling up empty ones.
export async function createProject(db: Database, input: { userID: string; name: string; now?: number }) {
  const now = input.now ?? Date.now()
  const idle = input.name
    ? undefined
    : await db
        .select()
        .from(projects)
        .where(
          and(
            eq(projects.user_id, input.userID),
            eq(projects.name, ""),
            notExists(
              db.select({ id: generations.id }).from(generations).where(eq(generations.project_id, projects.id)),
            ),
          ),
        )
        .orderBy(desc(projects.created_at))
        .get()
  if (idle) {
    await db.update(projects).set({ updated_at: now }).where(eq(projects.id, idle.id))
    return { ...idle, updated_at: now }
  }
  const row = { id: ulid(), user_id: input.userID, name: input.name, updated_at: now, created_at: now }
  await db.insert(projects).values(row)
  return row
}

export async function ownProject(db: Database, userID: string, id: string) {
  const row = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.user_id, userID)))
    .get()
  if (!row) throw new ApiError(404, "PROJECT_NOT_FOUND", "Không tìm thấy dự án")
  return row
}

export async function renameProject(db: Database, project: Project, name: string) {
  await db.update(projects).set({ name }).where(eq(projects.id, project.id))
  return { ...project, name }
}

// The project and its conversation go; its runs stay and show under "all" again.
export async function deleteProject(db: Database, project: Project) {
  await db
    .update(generations)
    .set({ project_id: null })
    .where(and(eq(generations.user_id, project.user_id), eq(generations.project_id, project.id)))
  await db.delete(project_messages).where(eq(project_messages.project_id, project.id))
  await db.delete(projects).where(eq(projects.id, project.id))
}

// A new run moves its project to the top of the list, and names it after the prompt if it has no
// name yet.
export async function touchProject(db: Database, project: Project, prompt: string, now = Date.now()) {
  const name = project.name || nameFromPrompt(prompt)
  await db.update(projects).set({ name, updated_at: now }).where(eq(projects.id, project.id))
}

// The prompt's opening words, cut at a word boundary: "Chú mèo cam ngủ trên bậu cửa sổ…".
export function nameFromPrompt(prompt: string) {
  const text = prompt.replace(/\s+/g, " ").trim()
  if (text.length <= NAME_FROM_PROMPT) return text
  const cut = text.slice(0, NAME_FROM_PROMPT)
  const space = cut.lastIndexOf(" ")
  return `${(space > NAME_FROM_PROMPT / 2 ? cut.slice(0, space) : cut).trimEnd()}…`
}
