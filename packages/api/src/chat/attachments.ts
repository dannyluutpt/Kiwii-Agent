import { and, eq, inArray } from "drizzle-orm"
import { ulid } from "ulid"
import { ApiError } from "../app"
import type { Database } from "../db/client"
import { files } from "../db/schema"
import type { MessagePart } from "./context"

export const MAX_ATTACHMENT_BYTES = 1024 * 1024
export const MAX_ATTACHMENTS = 5
// Text-like files only: their content goes straight into the model context.
const TEXT_EXTENSIONS = new Set([
  "txt",
  "md",
  "markdown",
  "csv",
  "tsv",
  "json",
  "xml",
  "yaml",
  "yml",
  "html",
  "htm",
  "css",
  "js",
  "mjs",
  "ts",
  "tsx",
  "jsx",
  "py",
  "rb",
  "go",
  "rs",
  "java",
  "kt",
  "c",
  "h",
  "cpp",
  "hpp",
  "cs",
  "php",
  "sql",
  "sh",
  "bash",
  "toml",
  "ini",
  "env",
  "log",
])

export function isTextAttachment(name: string, mime: string) {
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : ""
  return TEXT_EXTENSIONS.has(ext) || mime.startsWith("text/") || mime === "application/json"
}

export async function storeAttachment(db: Database, bucket: R2Bucket, userID: string, file: File) {
  if (file.size > MAX_ATTACHMENT_BYTES) throw new ApiError(400, "FILE_TOO_LARGE", "Tệp tối đa 1 MB")
  if (!isTextAttachment(file.name, file.type)) {
    throw new ApiError(400, "UNSUPPORTED_TYPE", "Chỉ nhận tệp văn bản, code, CSV, JSON hoặc Markdown")
  }
  const text = await file.text()
  const id = ulid()
  const key = `u/${userID}/${id}-${file.name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80)}`
  await bucket.put(key, text, { httpMetadata: { contentType: "text/plain; charset=utf-8" } })
  const mime = file.type || "text/plain"
  await db
    .insert(files)
    .values({
      id,
      user_id: userID,
      r2_key: key,
      name: file.name.slice(0, 120),
      mime,
      size: file.size,
      kind: "attachment",
    })
  return { id, name: file.name.slice(0, 120), mime, size: file.size }
}

// Builds the file parts for a message from attachment ids the user uploaded earlier.
export async function attachmentParts(
  db: Database,
  bucket: R2Bucket,
  userID: string,
  ids: string[],
): Promise<MessagePart[]> {
  if (ids.length === 0) return []
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.user_id, userID), eq(files.kind, "attachment"), inArray(files.id, ids)))
  if (rows.length !== new Set(ids).size) throw new ApiError(404, "FILE_NOT_FOUND", "Tệp đính kèm không tồn tại")
  const parts: MessagePart[] = []
  for (const row of rows) {
    const object = await bucket.get(row.r2_key)
    const text = (await object?.text()) ?? ""
    parts.push({ type: "file", file_id: row.id, name: row.name, mime: row.mime, size: row.size, text })
  }
  return parts
}
