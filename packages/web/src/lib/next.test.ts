/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { safeNext } from "./next"

describe("safeNext", () => {
  test("follows paths on this site", () => {
    expect(safeNext("/images")).toBe("/images")
    expect(safeNext("/images/assets?x=1")).toBe("/images/assets?x=1")
  })

  test("refuses anything that could leave the site", () => {
    expect(safeNext(undefined)).toBe("/images")
    expect(safeNext("")).toBe("/images")
    expect(safeNext("https://evil.example")).toBe("/images")
    expect(safeNext("//evil.example")).toBe("/images")
    expect(safeNext("/\\evil.example")).toBe("/images")
  })
})
