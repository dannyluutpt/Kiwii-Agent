import { describe, expect, test } from "bun:test"
import { existsSync } from "node:fs"
import { CATEGORIES, fillTemplate, MOVES, STYLES, templateExample, TEMPLATES, templateReady } from "./templates"

const poster = TEMPLATES.find((template) => template.id === "sale-poster")!

describe("templates", () => {
  test("a filled template reads as one prompt, and an empty optional sentence is left out", () => {
    const full = fillTemplate(poster, { product: "trà sữa", headline: "MUA 1 TẶNG 1", detail: "Chỉ hôm nay" })
    expect(full).toContain("trà sữa")
    expect(full).toContain('"MUA 1 TẶNG 1"')
    expect(full).toContain('"Chỉ hôm nay"')
    const short = fillTemplate(poster, { product: "trà sữa", headline: "MUA 1 TẶNG 1", detail: "  " })
    expect(short).not.toContain("dòng chữ nhỏ hơn")
    expect(short).not.toMatch(/[[\]{}]/)
    expect(short).not.toContain("  ")
  })

  test("a look or a camera move follows the prompt", () => {
    const move = MOVES.find((item) => item.id === "orbit")!.prompt
    const clip = TEMPLATES.find((template) => template.id === "food-steam")!
    expect(fillTemplate(clip, { dish: "lẩu" }, move).endsWith(move)).toBe(true)
  })

  test("a template is ready once its required words are in", () => {
    expect(templateReady(poster, { product: "trà sữa" })).toBe(false)
    expect(templateReady(poster, { product: "trà sữa", headline: "SALE" })).toBe(true)
  })

  test("every template is whole: a known category, its slots used in its prompt, both languages", () => {
    expect(new Set(TEMPLATES.map((template) => template.id)).size).toBe(TEMPLATES.length)
    for (const template of TEMPLATES) {
      expect(CATEGORIES.some((category) => category.id === template.category)).toBe(true)
      expect(template.aspectRatio).toMatch(/^\d+:\d+$/)
      const used = [...template.prompt.matchAll(/\{(\w+)\}/g)].map((match) => match[1])
      expect(used.sort()).toEqual(template.slots.map((slot) => slot.id).sort())
      for (const text of [template.title, template.lead, ...template.slots.flatMap((s) => [s.label, s.placeholder])]) {
        expect(text.vi.length).toBeGreaterThan(0)
        expect(text.en.length).toBeGreaterThan(0)
      }
      // An optional slot sits in a bracketed sentence, a required one outside any.
      const bracketed = [...template.prompt.matchAll(/\[([^\]]*)\]/g)].flatMap((match) =>
        [...match[1]!.matchAll(/\{(\w+)\}/g)].map((slot) => slot[1]),
      )
      expect(bracketed.sort()).toEqual(
        template.slots
          .filter((slot) => slot.optional)
          .map((slot) => slot.id)
          .sort(),
      )
    }
    expect(STYLES[0]?.prompt).toBe("")
  })

  test("every template has its example picture", () => {
    for (const template of TEMPLATES) {
      expect(existsSync(new URL(`../public${templateExample(template)}`, import.meta.url))).toBe(true)
    }
  })
})
