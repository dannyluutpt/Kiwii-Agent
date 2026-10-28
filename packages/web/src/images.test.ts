/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { altFor, gridFor } from "./images"

describe("gridFor", () => {
  test("one picture keeps a modest width and shrinks for tall frames", () => {
    expect(gridFor(1, "1:1")).toEqual({
      class: "grid-cols-1",
      style: { "max-width": "min(100%, 32rem, calc(1 * 60dvh * 1 / 1))" },
    })
    expect(gridFor(1, "9:16").style["max-width"]).toBe("min(100%, 32rem, calc(1 * 60dvh * 9 / 16))")
  })

  test("four pictures sit two by two", () => {
    expect(gridFor(4, "3:4").class).toBe("grid-cols-2")
    expect(gridFor(4, "3:4").style["max-width"]).toBe("min(100%, 32rem, calc(2 * 32dvh * 3 / 4))")
  })

  test("two and three pictures share one row", () => {
    expect(gridFor(2, "16:9").class).toBe("grid-cols-2")
    expect(gridFor(3, "16:9").class).toBe("grid-cols-3")
  })
})

describe("altFor", () => {
  test("prefers the prompt Kiwii actually used and keeps it short", () => {
    expect(altFor({ prompt: "mèo", promptEnhanced: null })).toBe("mèo")
    expect(altFor({ prompt: "mèo", promptEnhanced: "an orange cat" })).toBe("an orange cat")
    expect(altFor({ prompt: "x".repeat(300), promptEnhanced: null })).toHaveLength(120)
  })
})
