import type { generation_images, generations } from "../db/schema"
import { friendly } from "./generate"

export function fileURL(id: string) {
  return `/api/images/files/${id}`
}

// What the browser sees of a run. The rewritten prompt is internal and never leaves the server.
export function presentGeneration(
  g: typeof generations.$inferSelect,
  imageRows: Array<typeof generation_images.$inferSelect>,
) {
  return {
    id: g.id,
    status: g.status,
    model: g.model,
    option: g.option,
    aspectRatio: g.aspect_ratio,
    n: g.n,
    prompt: g.prompt_raw,
    enhance: g.enhance === 1,
    referenceFileIDs: JSON.parse(g.reference_file_ids) as string[],
    creditsReserved: g.credits_reserved,
    creditsFinal: g.credits_final,
    error: g.error === null ? null : friendly(g.error),
    projectID: g.project_id,
    createdAt: g.created_at,
    finishedAt: g.finished_at,
    images: imageRows.map((row) => ({
      id: row.id,
      fileID: row.file_id,
      position: row.position,
      url: fileURL(row.file_id),
    })),
  }
}
