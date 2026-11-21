// Renders marketing/promo/index.html to an MP4: every frame is the page at an exact time, pictured by
// a headless browser, then ffmpeg joins them. Run from the repository root:
//   node marketing/promo/render.mjs                 the whole film to marketing/out/amberpix-launch-9x16.mp4
//   node marketing/promo/render.mjs --stills 1,5,12 only those seconds, as PNGs, to check a layout
// The clips' frames are cut from packages/web/public/showcase/clips first (frames/ is not kept in git).
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "../..")
const out = join(root, "marketing/out")
const { chromium } = createRequire(join(root, "packages/web/package.json"))("playwright")

for (const clip of ["quan-pho", "hoa-dang"]) {
  const dir = join(here, "frames", clip)
  if (existsSync(dir)) continue
  mkdirSync(dir, { recursive: true })
  execFileSync("ffmpeg", [
    "-v", "error", "-y", "-i", join(root, `packages/web/public/showcase/clips/${clip}.mp4`),
    "-vf", "fps=30,scale=960:540", "-q:v", "4", join(dir, "%03d.jpg"),
  ])
}

const stills = process.argv.includes("--stills") ? process.argv[process.argv.indexOf("--stills") + 1].split(",").map(Number) : undefined
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 })
await page.goto(`file://${join(here, "index.html")}?render`)
await page.evaluate(() => document.fonts.ready)
const { duration, fps } = await page.evaluate(() => ({ duration: window.DURATION, fps: window.FPS }))
// The page at `seconds`, with every picture it shows loaded and decoded.
const at = async (seconds) => {
  await page.evaluate(async (t) => {
    window.setTime(t)
    await Promise.all([...document.images].filter((img) => img.src).map((img) => img.decode().catch(() => {})))
  }, seconds)
}
mkdirSync(out, { recursive: true })

if (stills) {
  for (const second of stills) {
    await at(second)
    await page.screenshot({ path: join(out, `still-${String(second).padStart(4, "0")}.png`) })
  }
  await browser.close()
  process.exit(0)
}

const shots = join(here, "frames/_render")
rmSync(shots, { recursive: true, force: true })
mkdirSync(shots, { recursive: true })
const total = duration * fps
for (let i = 0; i < total; i++) {
  await at(i / fps)
  await page.screenshot({ path: join(shots, `${String(i).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 })
  if (i % 150 === 0) console.log(`${i}/${total}`)
}
await browser.close()
const film = join(out, "amberpix-launch-9x16.mp4")
execFileSync("ffmpeg", [
  "-v", "error", "-y", "-framerate", String(fps), "-i", join(shots, "%05d.jpg"),
  // A silent stereo track: some players and upload forms refuse a file with no audio stream at all.
  "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
  "-c:v", "libx264", "-preset", "slow", "-crf", "20", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
  "-c:a", "aac", "-b:a", "96k", "-shortest", film,
])
rmSync(shots, { recursive: true, force: true })
console.log(film)
