import { expect, test } from "bun:test"
import { stillTime } from "./frame"

test("the last frame is taken just before the end, and a chosen second stays inside the clip", () => {
  expect(stillTime(5)).toBeCloseTo(4.95)
  expect(stillTime(0.02)).toBe(0)
  expect(stillTime(5, 2.5)).toBe(2.5)
  expect(stillTime(5, 9)).toBe(5)
  expect(stillTime(5, -1)).toBe(0)
  // A clip whose length is not known yet, or a stream without one.
  expect(stillTime(Number.NaN)).toBe(0)
  expect(stillTime(Number.POSITIVE_INFINITY, 3)).toBe(0)
})
