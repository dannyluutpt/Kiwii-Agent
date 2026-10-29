// Draws the Amberpix mark (a black "A" whose crossbar is a pixel, on amber yellow) and writes every
// icon the app ships: the in-app logo, the favicon fallback and the Home Screen icons. Run it after
// changing the mark; Playwright's Chromium does the rasterising:
//
//   bun script/icons.ts      (PLAYWRIGHT_CHROMIUM_EXECUTABLE points at a preinstalled browser)
import { writeFileSync } from "node:fs"
import { chromium } from "@playwright/test"

const YELLOW = "#ffd60a"
const BLACK = "#0a0a0a"

// The glyph on a 512 square. `scale` shrinks it about the centre (maskable icons keep it inside the
// safe circle); `radius` rounds the tile (0 for Home Screen icons, which the system rounds).
function mark(input: { scale: number; radius: number }) {
  const offset = (512 * (1 - input.scale)) / 2
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${input.radius}" fill="${YELLOW}"/>
  <g transform="translate(${offset} ${offset}) scale(${input.scale})" fill="${BLACK}">
    <path d="M256 100 L410 414 H338 L256 246 L174 414 H102 Z" stroke="${BLACK}" stroke-width="14" stroke-linejoin="round"/>
    <rect x="226" y="342" width="60" height="60" rx="8"/>
  </g>
</svg>
`
}

const logo = mark({ scale: 1, radius: 116 })
writeFileSync("public/logo.svg", logo)

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
const browser = await chromium.launch(executablePath ? { executablePath } : {})
const page = await browser.newPage()

async function png(svg: string, size: number, path: string, transparent: boolean) {
  await page.setViewportSize({ width: size, height: size })
  await page.setContent(
    `<body style="margin:0;background:${transparent ? "transparent" : BLACK}">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</body>`,
  )
  await page.screenshot({ path, omitBackground: transparent })
}

await png(logo, 256, "public/logo.png", true)
const fullBleed = mark({ scale: 1, radius: 0 })
await png(fullBleed, 180, "public/icons/apple-touch-icon.png", false)
await png(fullBleed, 192, "public/icons/icon-192.png", false)
await png(fullBleed, 512, "public/icons/icon-512.png", false)
await png(mark({ scale: 0.8, radius: 0 }), 512, "public/icons/icon-maskable-512.png", false)
await browser.close()
