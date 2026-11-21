import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { CLIPS, sample } from "./showcase"
import { TEMPLATES } from "./templates"
import { USE_CASES } from "./use-cases"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

describe("use-case pages", () => {
  test("each names templates, pictures and clips that exist", () => {
    expect(new Set(USE_CASES.map((page) => page.path)).size).toBe(USE_CASES.length)
    for (const page of USE_CASES) {
      expect(page.path).toMatch(/^\/[a-z0-9-]+$/)
      expect(page.templates.length).toBeGreaterThan(0)
      for (const id of page.templates) expect(TEMPLATES.some((template) => template.id === id)).toBe(true)
      for (const key of page.samples) expect(sample(key).key).toBe(key)
      for (const key of page.clips ?? []) expect(CLIPS.some((clip) => clip.key === key)).toBe(true)
      expect(page.samples.length + (page.clips?.length ?? 0)).toBeGreaterThan(0)
      expect(page.faq.length).toBeGreaterThan(0)
    }
  })

  test("each has its title for search engines and its line in the sitemap", () => {
    const seo = read("../../api/src/seo.ts")
    const sitemap = read("../public/sitemap.xml")
    for (const page of USE_CASES) {
      expect(seo).toContain(`"${page.path}": {`)
      expect(sitemap).toContain(`<loc>https://amberpix.com${page.path}</loc>`)
    }
  })
})
