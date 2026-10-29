import type { project_messages } from "../db/schema"

// What a turn holds. The person's turn: their text and the pictures (file ids) they attached. The
// assistant's turn: its reply, the runs it started, and a notice for a run that could not start.
export type MessagePart =
  | { type: "text"; text: string }
  | { type: "image"; fileID: string }
  | { type: "generation"; id: string }
  | { type: "notice"; code: string; message: string }

export function presentMessage(row: typeof project_messages.$inferSelect) {
  return { id: row.id, role: row.role, parts: JSON.parse(row.parts) as MessagePart[], createdAt: row.created_at }
}
