import { describe, expect, test } from "bun:test"
import { nextVietnamMidnight, vietnamDay } from "../src/util/day"

describe("vietnam day", () => {
  test("rolls over at 17:00 UTC", () => {
    expect(vietnamDay(Date.UTC(2026, 9, 27, 16, 59))).toBe("2026-10-27")
    expect(vietnamDay(Date.UTC(2026, 9, 27, 17, 0))).toBe("2026-10-28")
  })

  test("next midnight is the following 17:00 UTC", () => {
    expect(nextVietnamMidnight(Date.UTC(2026, 9, 27, 3, 0))).toBe(Date.UTC(2026, 9, 27, 17, 0))
    expect(nextVietnamMidnight(Date.UTC(2026, 9, 27, 18, 0))).toBe(Date.UTC(2026, 9, 28, 17, 0))
  })
})
