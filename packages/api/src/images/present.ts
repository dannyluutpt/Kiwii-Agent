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
    kind: g.kind,
    status: g.status,
    model: g.model,
    option: g.option,
    aspectRatio: g.aspect_ratio,
    n: g.n,
    prompt: g.prompt_raw,
    enhance: g.enhance === 1,
    referenceFileIDs: JSON.parse(g.reference_file_ids) as string[],
    // A clip's last frame; its first is referenceFileIDs.
    lastFrameFileID: g.last_frame_file_id,
    characterIDs: JSON.parse(g.character_ids) as string[],
    locationID: g.location_id,
    creditsReserved: g.credits_reserved,
    creditsFinal: g.credits_final,
    // Seconds, for a video.
    duration: g.duration,
    error: g.error === null ? null : friendly(g.error, g.kind === "video" ? "video" : "ảnh"),
    projectID: g.project_id,
    // A sheet run's picture saves as a character with its panels cut out.
    sheet: g.sheet,
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
