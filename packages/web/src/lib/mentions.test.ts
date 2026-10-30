/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { fold, mentionAt, placeMention } from "./mentions"

describe("mentionAt", () => {
  test("finds the tag being typed at the caret", () => {
    expect(mentionAt("@", 1)).toEqual({ start: 0, query: "" })
    expect(mentionAt("Cô gái @Li", 10)).toEqual({ start: 7, query: "Li" })
    // A name with spaces stays one tag while it is typed.
    expect(mentionAt("ở @Quán cà", 10)).toEqual({ start: 2, query: "Quán cà" })
    expect(mentionAt("@Linh đi dạo", 3)).toEqual({ start: 0, query: "Li" })
  })

  test("leaves an email, an @ inside a word, another line and a long run of text alone", () => {
    expect(mentionAt("lan@gmail.com", 9)).toBeUndefined()
    expect(mentionAt("@Linh\nđi", 8)).toBeUndefined()
    expect(mentionAt("không có", 4)).toBeUndefined()
    expect(mentionAt(`@${"x".repeat(41)}`, 42)).toBeUndefined()
  })
})

test("names compare without case or marks", () => {
  expect(fold("Quán Cà Phê Đào")).toBe("quan ca phe dao")
  expect(fold("Bãi biển Mỹ Khê").includes(fold("my khe"))).toBe(true)
})

test("a picked name takes the tag's place, with one space after it", () => {
  expect(placeMention("Cô gái @Li", { start: 7, query: "Li" }, "Linh")).toEqual({
    text: "Cô gái Linh ",
    caret: 12,
  })
  expect(placeMention("@qu ngồi", { start: 0, query: "qu" }, "Quán Gió")).toEqual({
    text: "Quán Gió ngồi",
    caret: 9,
  })
})
