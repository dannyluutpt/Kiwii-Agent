/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { safeNext } from "./next"

describe("safeNext", () => {
  test("follows paths on this site", () => {
    expect(safeNext("/images")).toBe("/images")
    expect(safeNext("/chat/abc?x=1")).toBe("/chat/abc?x=1")
  })

  test("refuses anything that could leave the site", () => {
    expect(safeNext(undefined)).toBe("/chat")
    expect(safeNext("")).toBe("/chat")
    expect(safeNext("https://evil.example")).toBe("/chat")
    expect(safeNext("//evil.example")).toBe("/chat")
    expect(safeNext("/\\evil.example")).toBe("/chat")
  })
})
