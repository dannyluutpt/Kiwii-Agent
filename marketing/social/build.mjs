// Pictures the posts in posts.json: node marketing/social/build.mjs  →  marketing/out/social/<key>.png
import { mkdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "../..")
const out = join(root, "marketing/out/social")
const { chromium } = createRequire(join(root, "packages/web/package.json"))("playwright")
const posts = JSON.parse(readFileSync(join(here, "posts.json"), "utf8"))

mkdirSync(out, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 })
await page.goto(`file://${join(here, "post.html")}`)
await page.evaluate(() => document.fonts.ready)
for (const post of posts) {
  await page.evaluate((item) => window.fill(item), post)
  await page.screenshot({ path: join(out, `${post.key}.png`) })
  console.log(post.key)
}
// The carousel: carousel.json, one picture a slide, in order.
const slides = JSON.parse(readFileSync(join(here, "carousel.json"), "utf8"))
await page.goto(`file://${join(here, "slide.html")}`)
await page.evaluate(() => document.fonts.ready)
for (const [index, slide] of slides.entries()) {
  await page.evaluate((item) => window.fill(item), slide)
  await page.screenshot({ path: join(out, `carousel-${index + 1}.png`) })
}
console.log(`carousel ${slides.length}`)
await browser.close()
