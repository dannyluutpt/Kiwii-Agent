import { describe, expect, test } from "bun:test"
import * as XLSX from "xlsx"
import { buildCodeFile } from "../src/chat/tools/code"
import { buildDocx } from "../src/chat/tools/docx"
import { safeName } from "../src/chat/tools/shared"
import { buildXlsx } from "../src/chat/tools/xlsx"

describe("chat tools", () => {
  test("safeName strips diacritics and unsafe characters", () => {
    expect(safeName("Báo cáo quý 3/2026.docx", "x")).toBe("Bao-cao-quy-3-2026.docx")
    expect(safeName("///", "fallback")).toBe("fallback")
  })

  test("buildDocx produces a zip-shaped docx with the expected name", async () => {
    const file = await buildDocx({
      filename: "hợp đồng",
      title: "Hợp đồng thuê nhà",
      blocks: [
        { type: "heading", text: "Điều 1", level: 1 },
        { type: "paragraph", text: "Bên A cho bên B thuê.\n\nThời hạn 12 tháng." },
        { type: "bullets", items: ["Giá 5 triệu", "Cọc 1 tháng"] },
        { type: "numbered", items: ["Ký", "Thanh toán"] },
        {
          type: "table",
          rows: [
            ["Mục", "Giá"],
            ["Thuê", "5.000.000"],
          ],
        },
      ],
    })
    expect(file.name).toBe("hop-dong.docx")
    expect(file.mime).toContain("wordprocessingml")
    // Zip local file header.
    expect([...file.bytes.slice(0, 2)]).toEqual([0x50, 0x4b])
    expect(file.bytes.byteLength).toBeGreaterThan(2000)
  })

  test("buildXlsx writes sheets that SheetJS can read back, keeping numbers numeric", () => {
    const file = buildXlsx({
      filename: "doanh thu",
      sheets: [
        {
          name: "Q3",
          rows: [
            ["Tháng", "Doanh thu"],
            ["7", 100],
            ["8", 250.5],
            ["9", null],
          ],
        },
        { name: "Q3", rows: [["x"]] },
      ],
    })
    expect(file.name).toBe("doanh-thu.xlsx")
    const workbook = XLSX.read(file.bytes, { type: "array" })
    expect(workbook.SheetNames).toEqual(["Q3", "Q3_1"])
    const rows = XLSX.utils.sheet_to_json<Array<string | number>>(workbook.Sheets["Q3"]!, { header: 1 })
    expect(rows[2]).toEqual(["8", 250.5])
  })

  test("buildXlsx rejects oversized sheets and bad input", () => {
    expect(() => buildXlsx({ filename: "a", sheets: [] })).toThrow()
    const rows = Array.from({ length: 300 }, () => Array.from({ length: 100 }, () => 1))
    expect(() => buildXlsx({ filename: "a", sheets: [{ name: "big", rows }] })).toThrow(/too large/)
  })

  test("buildCodeFile infers the mime type and keeps the extension", () => {
    const file = buildCodeFile({ filename: "app.py", content: "print('hi')" })
    expect(file.name).toBe("app.py")
    expect(file.mime).toContain("text/x-python")
    expect(new TextDecoder().decode(file.bytes)).toBe("print('hi')")
    expect(buildCodeFile({ filename: "notes", content: "x" }).name).toBe("notes.txt")
  })
})
