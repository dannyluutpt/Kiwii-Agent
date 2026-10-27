import { z } from "zod"
import { safeName, type GeneratedFile } from "./shared"

const Input = z.object({ filename: z.string().min(1).max(120), content: z.string().max(400_000) })

const MIMES: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  ts: "text/typescript",
  json: "application/json",
  md: "text/markdown",
  csv: "text/csv",
  txt: "text/plain",
  xml: "application/xml",
  svg: "image/svg+xml",
  py: "text/x-python",
  sql: "application/sql",
  sh: "text/x-shellscript",
  yaml: "text/yaml",
  yml: "text/yaml",
}

export function buildCodeFile(raw: unknown): GeneratedFile {
  const input = Input.parse(raw)
  const name = safeName(input.filename, "file.txt")
  const ext = name.includes(".") ? name.split(".").pop()!.toLowerCase() : "txt"
  return {
    bytes: new TextEncoder().encode(input.content),
    name: name.includes(".") ? name : `${name}.txt`,
    mime: `${MIMES[ext] ?? "text/plain"}; charset=utf-8`,
  }
}
