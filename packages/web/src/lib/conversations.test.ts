/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { dateGroup, fold, groupByDate } from "./conversations"

const now = new Date(2026, 9, 28, 15, 0).getTime()
const at = (days: number, hour = 12) => new Date(2026, 9, 28 - days, hour).getTime()

describe("dateGroup", () => {
  test("buckets by local calendar day", () => {
    expect(dateGroup(at(0, 0), now)).toBe("today")
    expect(dateGroup(at(1, 23), now)).toBe("yesterday")
    expect(dateGroup(at(5), now)).toBe("week")
    expect(dateGroup(at(20), now)).toBe("month")
    expect(dateGroup(at(60), now)).toBe("older")
  })

  test("groups keep display order and drop empty buckets", () => {
    const items = [{ lastMessageAt: at(0) }, { lastMessageAt: at(40) }, { lastMessageAt: at(1) }]
    expect(groupByDate(items, now).map((g) => [g.group, g.items.length])).toEqual([
      ["today", 1],
      ["yesterday", 1],
      ["older", 1],
    ])
  })
})

describe("fold", () => {
  test("matches Vietnamese text without diacritics", () => {
    expect(fold("Kế hoạch du lịch Đà Lạt")).toBe("ke hoach du lich da lat")
    expect(fold("Thư viện Ảnh")).toBe("thu vien anh")
  })
})
