import * as XLSX from "xlsx"
import { z } from "zod"
import { safeName, type GeneratedFile } from "./shared"

const Cell = z.union([z.string().max(5_000), z.number(), z.boolean(), z.null()])
const Input = z.object({
  filename: z.string().min(1).max(100),
  sheets: z
    .array(
      z.object({
        name: z.string().min(1).max(31),
        rows: z.array(z.array(Cell).max(100)).max(5_000),
      }),
    )
    .min(1)
    .max(10),
})

export function buildXlsx(raw: unknown): GeneratedFile {
  const input = Input.parse(raw)
  const cells = input.sheets.reduce((n, s) => n + s.rows.reduce((m, r) => m + r.length, 0), 0)
  if (cells > 20_000) throw new Error("spreadsheet too large (max 20000 cells)")
  const workbook = XLSX.utils.book_new()
  const used = new Set<string>()
  for (const sheet of input.sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows)
    const widths = Array.from({ length: Math.max(0, ...sheet.rows.map((r) => r.length)) }, (_, i) =>
      Math.min(60, Math.max(8, ...sheet.rows.map((r) => String(r[i] ?? "").length + 2))),
    )
    worksheet["!cols"] = widths.map((wch) => ({ wch }))
    let name =
      sheet.name
        .replace(/[\\/?*[\]:]/g, " ")
        .trim()
        .slice(0, 31) || "Sheet"
    while (used.has(name)) name = `${name.slice(0, 28)}_${used.size}`
    used.add(name)
    XLSX.utils.book_append_sheet(workbook, worksheet, name)
  }
  const bytes = new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer)
  return {
    bytes,
    name: `${safeName(input.filename.replace(/\.xlsx$/i, ""), "sheet")}.xlsx`,
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }
}
