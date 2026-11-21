import { describe, expect, test } from "bun:test"
import { columnsOf, tileHeight } from "./masonry"

const run = (id: string, aspectRatio = "1:1", n = 1) => ({ id, aspectRatio, n })
const ids = (columns: Array<Array<{ id: string }>>) => columns.map((column) => column.map((item) => item.id))

describe("masonry", () => {
  test("a tall frame and a run of several pictures are taller than one square", () => {
    expect(tileHeight(run("a", "9:16"))).toBeGreaterThan(tileHeight(run("a")))
    expect(tileHeight(run("a", "1:1", 4))).toBeCloseTo(tileHeight(run("a")))
    expect(tileHeight(run("a", "1:1", 3))).toBeCloseTo(tileHeight(run("a")))
    expect(tileHeight(run("a", "16:9"))).toBeLessThan(tileHeight(run("a")))
  })

  test("tiles fill the shortest column", () => {
    const placed = new Map<string, number>()
    const list = [run("a", "9:16"), run("b"), run("c"), run("d")]
    // The tall one is worth nearly two squares: both squares go beside it before a third joins it.
    expect(ids(columnsOf(list, 2, tileHeight, placed))).toEqual([
      ["a", "d"],
      ["b", "c"],
    ])
  })

  test("a new run on top and a loaded page below move no tile to another column", () => {
    const placed = new Map<string, number>()
    const list = [run("c"), run("d", "9:16"), run("e"), run("f")]
    const before = new Map(
      columnsOf(list, 3, tileHeight, placed).flatMap((column, at) => column.map((i) => [i.id, at])),
    )
    const after = columnsOf([run("a"), run("b"), ...list, run("g"), run("h")], 3, tileHeight, placed)
    for (const [at, column] of after.entries()) {
      for (const item of column) if (before.has(item.id)) expect(before.get(item.id)).toBe(at)
    }
    // Newest first inside each column.
    expect(after.flat().length).toBe(8)
    expect(after.find((column) => column.some((i) => i.id === "a"))?.[0]?.id).toBe("a")
  })

  test("a deleted tile leaves the others where they are, and fewer columns start over", () => {
    const placed = new Map<string, number>()
    const list = [run("a"), run("b"), run("c"), run("d")]
    const first = ids(columnsOf(list, 2, tileHeight, placed))
    const without = ids(
      columnsOf(
        list.filter((item) => item.id !== "b"),
        2,
        tileHeight,
        placed,
      ),
    )
    expect(without).toEqual(first.map((column) => column.filter((id) => id !== "b")))
    const wide = new Map<string, number>()
    columnsOf(list, 4, tileHeight, wide)
    expect(columnsOf(list, 2, tileHeight, wide).every((column) => column.length === 2)).toBe(true)
  })
})
