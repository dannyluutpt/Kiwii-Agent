/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { fitWithin } from "./image"

describe("fitWithin", () => {
  test("scales the long edge down to the limit and keeps the shape", () => {
    expect(fitWithin(6000, 4000)).toEqual({ width: 2048, height: 1365 })
    expect(fitWithin(3000, 8000)).toEqual({ width: 768, height: 2048 })
  })

  test("leaves smaller pictures alone", () => {
    expect(fitWithin(1200, 900)).toEqual({ width: 1200, height: 900 })
    expect(fitWithin(2048, 2048)).toEqual({ width: 2048, height: 2048 })
  })
})
