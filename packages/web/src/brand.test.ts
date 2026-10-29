/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { BRAND as API_BRAND } from "../../api/src/brand"
import { BRAND } from "./brand"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

// index.html and the manifest are static, so they spell the name out; this keeps them in step.
describe("brand", () => {
  test("the web app, the API, the page and the manifest use one name", () => {
    expect(API_BRAND).toBe(BRAND)
    const html = read("../index.html")
    expect(html).toContain(`<title>${BRAND}</title>`)
    expect(html).toContain(`<meta name="apple-mobile-web-app-title" content="${BRAND}" />`)
    expect(JSON.parse(read("../public/manifest.webmanifest"))).toMatchObject({ name: BRAND, short_name: BRAND })
  })
})
