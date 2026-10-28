import { ulid } from "ulid"
import type { Database } from "../../db/client"
import { files } from "../../db/schema"
import type { ToolDefinition } from "../../llm/openrouter"
import { buildCodeFile } from "./code"
import { buildDocx } from "./docx"
import { searchWeb } from "./search"
import { buildXlsx } from "./xlsx"
import type { GeneratedFile } from "./shared"

export type ToolContext = {
  db: Database
  bucket: R2Bucket
  userID: string
  messageID: string
  apiKey: string
  baseURL?: string
  now: Date
}

export type FilePart = { type: "file"; file_id: string; name: string; mime: string; size: number }

export const CHAT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "web_search",
      description:
        "Search the web for current information: news, prices, exchange rates, weather, scores, release dates, anything that may have changed recently or that you are not sure about. Returns a short summary plus the sources (title, url, excerpt). Cite the sources you use as Markdown links in your reply.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "A focused search query, in the language most likely to have good results",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_docx",
      description:
        "Create a Word (.docx) document and hand it to the user as a download. Use when the user asks for a Word file, a report, a letter, a contract or any document they will open in Word. Write the full content in `blocks`; do not also repeat the whole document in your reply.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "File name without extension, e.g. 'bao-cao-quy-3'" },
          title: { type: "string", description: "Optional document title shown as the first heading" },
          blocks: {
            type: "array",
            description: "Document body in order",
            items: {
              type: "object",
              properties: {
                type: { type: "string", enum: ["heading", "paragraph", "bullets", "numbered", "table"] },
                text: { type: "string", description: "For heading / paragraph" },
                level: { type: "integer", minimum: 1, maximum: 3, description: "Heading level" },
                items: { type: "array", items: { type: "string" }, description: "For bullets / numbered" },
                rows: {
                  type: "array",
                  items: { type: "array", items: { type: "string" } },
                  description: "For table: first row is the header",
                },
              },
              required: ["type"],
            },
          },
        },
        required: ["filename", "blocks"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_xlsx",
      description:
        "Create an Excel (.xlsx) workbook and hand it to the user as a download. Use when the user asks for a spreadsheet, a table to open in Excel, or data to download. Numbers should be passed as numbers so Excel can compute with them.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "File name without extension" },
          sheets: {
            type: "array",
            minItems: 1,
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Sheet name, max 31 characters" },
                rows: {
                  type: "array",
                  description: "Rows of cells; first row is usually the header",
                  items: { type: "array", items: { type: ["string", "number", "boolean", "null"] } },
                },
              },
              required: ["name", "rows"],
            },
          },
        },
        required: ["filename", "sheets"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_code_file",
      description:
        "Save source code or a text file (e.g. .py, .ts, .html, .sql, .json, .md, .csv) and hand it to the user as a download. Use when the user asks for a file rather than an inline snippet, or when the content is long.",
      parameters: {
        type: "object",
        properties: {
          filename: { type: "string", description: "File name with extension, e.g. 'app.py'" },
          content: { type: "string" },
        },
        required: ["filename", "content"],
      },
    },
  },
]

export const MAX_TOOL_ROUNDS = 3

export async function runTool(
  ctx: ToolContext,
  name: string,
  rawArgs: string,
): Promise<{ output: unknown; file?: FilePart; costUsd?: number }> {
  let args: unknown
  try {
    args = JSON.parse(rawArgs || "{}")
  } catch {
    return { output: { error: "arguments were not valid JSON" } }
  }
  if (name === "web_search") {
    try {
      const { costUsd, ...output } = await searchWeb(args, { apiKey: ctx.apiKey, baseURL: ctx.baseURL, now: ctx.now })
      return { output, costUsd }
    } catch (error) {
      return { output: { error: error instanceof Error ? error.message : String(error) } }
    }
  }
  let built: GeneratedFile
  try {
    if (name === "create_docx") built = await buildDocx(args)
    else if (name === "create_xlsx") built = buildXlsx(args)
    else if (name === "create_code_file") built = buildCodeFile(args)
    else return { output: { error: `unknown tool ${name}` } }
  } catch (error) {
    return { output: { error: error instanceof Error ? error.message : String(error) } }
  }
  const id = ulid()
  const key = `u/${ctx.userID}/${id}-${built.name}`
  await ctx.bucket.put(key, built.bytes, { httpMetadata: { contentType: built.mime } })
  await ctx.db.insert(files).values({
    id,
    user_id: ctx.userID,
    r2_key: key,
    name: built.name,
    mime: built.mime,
    size: built.bytes.byteLength,
    kind: "generated",
    message_id: ctx.messageID,
  })
  const file: FilePart = { type: "file", file_id: id, name: built.name, mime: built.mime, size: built.bytes.byteLength }
  return {
    output: {
      ok: true,
      file: built.name,
      size: built.bytes.byteLength,
      note: "The file is attached to your reply; tell the user it is ready in one short sentence.",
    },
    file,
  }
}
