/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { safeNext } from "./next"

describe("safeNext", () => {
  test("follows paths on this site", () => {
    expect(safeNext("/p/01ABC")).toBe("/p/01ABC")
    expect(safeNext("/library?x=1")).toBe("/library?x=1")
  })

  test("refuses anything that could leave the site", () => {
    expect(safeNext(undefined)).toBe("/")
    expect(safeNext("")).toBe("/")
    expect(safeNext("https://evil.example")).toBe("/")
    expect(safeNext("//evil.example")).toBe("/")
    expect(safeNext("/\\evil.example")).toBe("/")
  })
})
