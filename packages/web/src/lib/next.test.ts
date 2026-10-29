/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { safeNext, withNext } from "./next"

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

describe("withNext", () => {
  test("carries the page to return to, if there is one", () => {
    expect(withNext("/login", undefined)).toBe("/login")
    expect(withNext("/login", "/pricing")).toBe("/login?next=%2Fpricing")
    expect(withNext("/signup/verify?email=a%40b.vn", "/?prompt=M%C3%A8o")).toBe(
      "/signup/verify?email=a%40b.vn&next=%2F%3Fprompt%3DM%25C3%25A8o",
    )
  })
})
