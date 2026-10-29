/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { BRAND } from "./brand"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")

// The API keeps its own copy of the name, and index.html and the manifest are static, so they spell
// it out; this keeps them all in step.
describe("brand", () => {
  test("the web app, the API, the page and the manifest use one name", () => {
    expect(read("../../api/src/brand.ts")).toContain(`export const BRAND = "${BRAND}"`)
    const html = read("../index.html")
    expect(html).toContain(`<title>${BRAND}</title>`)
    expect(html).toContain(`<meta name="apple-mobile-web-app-title" content="${BRAND}" />`)
    expect(JSON.parse(read("../public/manifest.webmanifest"))).toMatchObject({ name: BRAND, short_name: BRAND })
  })
})
