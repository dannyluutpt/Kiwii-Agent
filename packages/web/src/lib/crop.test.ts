/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { FACE_GUESS, keepInside, MIN_SQUARE, squarePixels } from "./crop"

describe("squarePixels", () => {
  test("cuts a square around the centre, sized by the shorter edge", () => {
    expect(squarePixels({ x: 0.5, y: 0.5, size: 0.5 }, 1000, 2000)).toEqual({ left: 250, top: 750, side: 500 })
    expect(squarePixels({ x: 0.5, y: 0.5, size: 1 }, 2000, 1000)).toEqual({ left: 500, top: 0, side: 1000 })
  })

  test("never reaches outside the photo", () => {
    expect(squarePixels({ x: 0, y: 0, size: 0.4 }, 1000, 1500)).toEqual({ left: 0, top: 0, side: 400 })
    expect(squarePixels({ x: 1, y: 1, size: 0.4 }, 1000, 1500)).toEqual({ left: 600, top: 1100, side: 400 })
    expect(squarePixels({ x: 0.5, y: 0.5, size: 3 }, 800, 600)).toEqual({ left: 100, top: 0, side: 600 })
  })

  test("the first guess lands on the head of an upright full-length photo", () => {
    const box = squarePixels(FACE_GUESS, 1717, 2576)
    expect(box.side).toBe(773)
    expect(box.top).toBeLessThan(2576 / 4)
    expect(box.left + box.side / 2).toBeCloseTo(1717 / 2, -1)
  })
})

describe("keepInside", () => {
  test("holds a minimum size and pushes the centre back in", () => {
    expect(keepInside({ x: 0.5, y: 0.5, size: 0.01 }, 1000, 1000).size).toBe(MIN_SQUARE)
    expect(keepInside({ x: -1, y: 2, size: 0.5 }, 1000, 2000)).toEqual({ x: 0.25, y: 0.875, size: 0.5 })
  })
})
