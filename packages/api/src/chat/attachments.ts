import { and, eq, inArray } from "drizzle-orm"
import { ulid } from "ulid"
import { ApiError } from "../app"
import type { Database } from "../db/client"
import { files } from "../db/schema"
import type { MessagePart } from "./context"

export const MAX_ATTACHMENT_BYTES = 1024 * 1024
export const MAX_PDF_BYTES = 5 * 1024 * 1024
// Extracted text beyond this is cut so one PDF cannot swallow the whole context budget.
export const MAX_EXTRACTED_CHARS = 200_000
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

export function isPdfAttachment(name: string, mime: string) {
  return mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")
}

// pdf.js is loaded on demand so chat requests without a PDF never pay for it.
export async function extractPdfText(bytes: Uint8Array) {
  const { extractText, getDocumentProxy } = await import("unpdf")
  const pdf = await getDocumentProxy(bytes)
  const { text, totalPages } = await extractText(pdf, { mergePages: true })
  return { text: text.replace(/[ \t]+\n/g, "\n").trim(), pages: totalPages }
}

export async function storeAttachment(db: Database, bucket: R2Bucket, userID: string, file: File) {
  const pdf = isPdfAttachment(file.name, file.type)
  if (!pdf && !isTextAttachment(file.name, file.type)) {
    throw new ApiError(400, "UNSUPPORTED_TYPE", "Chỉ nhận tệp văn bản, code, CSV, JSON, Markdown hoặc PDF")
  }
  if (file.size > (pdf ? MAX_PDF_BYTES : MAX_ATTACHMENT_BYTES)) {
    throw new ApiError(400, "FILE_TOO_LARGE", pdf ? "PDF tối đa 5 MB" : "Tệp tối đa 1 MB")
  }
  let text: string
  if (pdf) {
    const extracted = await extractPdfText(new Uint8Array(await file.arrayBuffer())).catch(() => undefined)
    if (!extracted || !extracted.text) {
      throw new ApiError(400, "PDF_NO_TEXT", "Không đọc được chữ trong PDF (có thể là ảnh scan)")
    }
    text = extracted.text
  } else {
    text = await file.text()
  }
  if (text.length > MAX_EXTRACTED_CHARS) text = `${text.slice(0, MAX_EXTRACTED_CHARS)}\n\n[... cắt bớt ...]`
  const id = ulid()
  const key = `u/${userID}/${id}-${file.name.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 80)}`
  await bucket.put(key, text, { httpMetadata: { contentType: "text/plain; charset=utf-8" } })
  const mime = file.type || "text/plain"
  await db.insert(files).values({
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
