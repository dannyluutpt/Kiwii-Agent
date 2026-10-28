/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { remaining } from "./time"

describe("remaining", () => {
  test("a passed deadline is expired", () => {
    expect(remaining(0)).toEqual({ kind: "expired" })
    expect(remaining(-5000)).toEqual({ kind: "expired" })
  })

  test("the last ten minutes tick as m:ss", () => {
    expect(remaining(600_000)).toEqual({ kind: "clock", text: "10:00" })
    expect(remaining(65_000)).toEqual({ kind: "clock", text: "1:05" })
    expect(remaining(400)).toEqual({ kind: "clock", text: "0:01" })
  })

  test("within the hour it counts minutes, rounding up", () => {
    expect(remaining(600_001)).toEqual({ kind: "minutes", minutes: 11 })
    expect(remaining(59 * 60_000)).toEqual({ kind: "minutes", minutes: 59 })
  })

  test("longer waits read as hours and minutes", () => {
    expect(remaining(60 * 60_000)).toEqual({ kind: "hours", hours: 1, minutes: 0 })
    expect(remaining(24 * 60 * 60_000 - 30_000)).toEqual({ kind: "hours", hours: 24, minutes: 0 })
    expect(remaining((2 * 60 + 5) * 60_000)).toEqual({ kind: "hours", hours: 2, minutes: 5 })
  })
})
