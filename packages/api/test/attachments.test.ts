import { describe, expect, test } from "bun:test"
import { extractPdfText, isPdfAttachment, isTextAttachment } from "../src/chat/attachments"

describe("attachments", () => {
  test("classifies text-like and pdf files", () => {
    expect(isTextAttachment("notes.md", "")).toBe(true)
    expect(isTextAttachment("data.csv", "text/csv")).toBe(true)
    expect(isTextAttachment("photo.jpg", "image/jpeg")).toBe(false)
    expect(isPdfAttachment("menu.PDF", "")).toBe(true)
    expect(isPdfAttachment("menu.txt", "application/pdf")).toBe(true)
    expect(isPdfAttachment("menu.txt", "text/plain")).toBe(false)
  })

  test("extracts text from every page of a PDF", async () => {
    const bytes = new Uint8Array(await Bun.file(new URL("./fixtures/menu.pdf", import.meta.url)).arrayBuffer())
    const result = await extractPdfText(bytes)
    expect(result.pages).toBe(2)
    expect(result.text).toContain("pho 45000")
    expect(result.text).toContain("tra da 5000")
  })
})
