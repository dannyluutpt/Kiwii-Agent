import { expect, recordShares, test, type Locator, type Page } from "./fixtures"
import { PRO_STATE, STATE } from "./global-setup"

// The image studio and library against the mock OpenRouter, as a paid account with credits.
test.use({ storageState: PRO_STATE })

// The studio's own address, the root of the site.
const STUDIO = /^[^?#]*:\d+\/$/
const prompt = (page: Page) => page.getByRole("textbox", { name: /^Mô tả bức ảnh/ })
const card = (page: Page, text: string) => page.getByRole("article", { name: text }).first()

// Phones make pictures straight from the composer. Wide screens ask the image assistant, which in the
// mock starts one run with the message as its prompt; its button names the cheapest a reply costs.
const generateButton = (page: Page, isMobile: boolean, cost?: number) => {
  const label = isMobile ? "Tạo ảnh, " : "Gửi, từ "
  return page.getByRole("button", {
    name: cost === undefined ? new RegExp(`^${label}\\d+ credit$`) : `${label}${cost} credit`,
  })
}

type Setting = "Model" | "Chất lượng" | "Tỷ lệ" | "Số ảnh"

// On phones every option sits in one bottom sheet, opened from the chip under the prompt; on wide
// screens each setting is a chip of the assistant's composer with its own popover, closed by a pick.
async function openOptions(page: Page, isMobile: boolean, setting: Setting) {
  if (isMobile) {
    await page.getByRole("button", { name: /^Tuỳ chọn:/ }).click()
    return page.getByRole("dialog", { name: "Tuỳ chọn" })
  }
  await page.getByRole("button", { name: new RegExp(`^${setting}:`) }).click()
  return page.getByRole("dialog", { name: setting })
}

async function closeOptions(page: Page, isMobile: boolean) {
  if (!isMobile) return
  const sheet = page.getByRole("dialog", { name: "Tuỳ chọn" })
  await sheet.getByRole("button", { name: "Xong" }).click()
  await expect(sheet).toBeHidden()
}

const choice = (panel: Locator, text: string) => panel.locator("label").filter({ hasText: new RegExp(`^${text}$`) })

async function chooseOptions(page: Page, isMobile: boolean, picked: { ratio: string; count: string }) {
  const frame = await openOptions(page, isMobile, "Tỷ lệ")
  await choice(frame, picked.ratio).click()
  const count = isMobile ? frame : await openOptions(page, isMobile, "Số ảnh")
  await choice(count, picked.count).click()
  if (isMobile) await expect(frame.getByRole("radio", { name: picked.ratio })).toBeChecked()
  if (!isMobile) await expect(page.getByRole("button", { name: `Tỷ lệ: ${picked.ratio}` })).toBeVisible()
  // Rewriting the prompt is the server's call, so no switch offers it.
  await expect(page.getByRole("switch")).toHaveCount(0)
  await closeOptions(page, isMobile)
}

async function pickModel(page: Page, isMobile: boolean, name: string) {
  const panel = await openOptions(page, isMobile, "Model")
  // The radio input is visually hidden; its label is what a person taps.
  await panel.getByRole("radiogroup", { name: "Model" }).locator("label").filter({ hasText: name }).click()
  if (isMobile) await expect(panel.getByRole("radio", { name: new RegExp(name) })).toBeChecked()
  if (!isMobile) await expect(page.getByRole("button", { name: new RegExp(`^Model: ${name}`) })).toBeVisible()
  await closeOptions(page, isMobile)
}

// A photo of the given size, drawn in the page so the test needs no fixture file.
async function photo(page: Page, width: number, height: number) {
  const bytes = await page.evaluate(
    async ([w, h]) => {
      const canvas = document.createElement("canvas")
      canvas.width = w!
      canvas.height = h!
      const context = canvas.getContext("2d")!
      context.fillStyle = "#3a7"
      context.fillRect(0, 0, w!, h!)
      const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.8))
      return Array.from(new Uint8Array(await blob.arrayBuffer()))
    },
    [width, height],
  )
  return { name: "big.jpg", mimeType: "image/jpeg", buffer: Buffer.from(bytes) }
}

test("a run streams into the gallery and its pictures open in the viewer", async ({ page, isMobile }) => {
  await page.goto("/")
  await chooseOptions(page, isMobile, { ratio: "3:4", count: "2" })
  if (isMobile) await expect(page.getByRole("button", { name: /^Tuỳ chọn:/ })).toHaveAccessibleName(/3:4 · 2 ảnh/)

  const text = `Chú mèo cam trên bậu cửa sổ ${isMobile ? "phone" : "desktop"}`
  await prompt(page).fill(text)
  // Two Standard GPT pictures at 3 credits each.
  await generateButton(page, isMobile, 6).click()
  await expect(prompt(page)).toHaveValue("")

  const run = card(page, text)
  // The run is in the gallery at once, shimmering while the server prepares it.
  await expect(run).toHaveAttribute("aria-busy", "true")
  await expect(run.getByRole("button", { name: "Mở ảnh 2 trên 2" })).toBeVisible({ timeout: 15_000 })
  await expect(run.getByRole("button", { name: "Mở ảnh 1 trên 2" })).toBeVisible()
  await expect(run).toHaveAttribute("aria-busy", "false")

  const first = run.getByRole("button", { name: "Mở ảnh 1 trên 2" })
  await first.click()
  const viewer = page.getByRole("dialog")
  await expect(viewer).toContainText("1 / 2")
  // The viewer speaks the customer's words; the server's rewrite (the mock adds "cinematic lighting")
  // stays on the server.
  await expect(viewer.getByRole("img")).toHaveAttribute("alt", text)
  await expect(viewer).toContainText(text)
  await expect(viewer).not.toContainText("cinematic lighting")
  await page.keyboard.press("ArrowRight")
  await expect(viewer).toContainText("2 / 2")
  await page.keyboard.press("Escape")
  await expect(viewer).toBeHidden()
  await expect(first).toBeFocused()

  // Reuse from the viewer hands the prompt back to the composer and keeps focus there.
  await first.click()
  await viewer.getByRole("button", { name: "Dùng lại prompt" }).click()
  await expect(viewer).toBeHidden()
  await expect(prompt(page)).toHaveValue(text)
  // Focus returns from the viewer a moment after it unmounts; it must not pull focus off the prompt.
  await page.waitForTimeout(300)
  await expect(prompt(page)).toBeFocused()

  // No menu entry reveals the rewrite, and the API never hands it to the browser.
  await run.getByRole("button", { name: "Thao tác khác" }).click()
  await expect(page.getByRole("menuitem")).toHaveText(["Sao chép prompt", "Xoá"])
  await page.keyboard.press("Escape")
  const feed = await (await page.request.get("/api/images/generations")).text()
  expect(feed).toContain(text)
  expect(feed).not.toContain("cinematic lighting")
})

test("the options sheet closes when its top bar is dragged down", async ({ page, isMobile }) => {
  test.skip(!isMobile, "the sheet is the phone layout")
  await page.goto("/")
  await page.getByRole("button", { name: /^Tuỳ chọn:/ }).click()
  const sheet = page.getByRole("dialog", { name: "Tuỳ chọn" })
  await expect(sheet).toBeVisible()
  await page.waitForTimeout(400)
  const handle = await sheet.locator("[data-sheet-handle]").first().boundingBox()
  if (!handle) throw new Error("sheet handle not laid out")
  const x = handle.x + handle.width / 2
  await page.mouse.move(x, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, handle.y + 420, { steps: 10 })
  await page.mouse.up()
  await expect(sheet).toBeHidden()
})

test("a failed run is retried in place, reused and deleted", async ({ page }, info) => {
  // Each project gets its own prompt: runs from the other project stay in the shared history.
  const text = `Ảnh lỗi FAIL để thử lại ${info.project.name}`
  await page.goto("/")
  await prompt(page).fill(text)
  await page.keyboard.press("Enter")
  const runs = page.getByRole("article", { name: text })
  const failed = runs.first()
  const alert = failed.getByRole("alert")
  await expect(alert).toBeVisible({ timeout: 15_000 })
  await expect(alert).toContainText("Đã hoàn")

  // Retrying turns the same tile back into a run in progress; no second tile appears.
  await alert.getByRole("button", { name: "Thử lại" }).click()
  await expect(failed).toHaveAttribute("aria-busy", "true")
  await expect(alert).toBeVisible({ timeout: 15_000 })
  await expect(runs).toHaveCount(1)

  await failed.getByRole("button", { name: "Dùng lại prompt" }).click()
  await expect(prompt(page)).toHaveValue(text)
  await expect(prompt(page)).toBeFocused()

  await failed.getByRole("button", { name: "Thao tác khác" }).click()
  await page.getByRole("menuitem", { name: "Xoá" }).click()
  const confirm = page.getByRole("dialog", { name: "Xoá lượt tạo này?" })
  await confirm.getByRole("button", { name: "Xoá" }).click()
  await expect(confirm).toBeHidden()
  await expect(runs).toHaveCount(0)
})

// A run whose prompt was screened and rewritten but whose picture failed is retried with that same
// rewrite. The mock numbers every rewrite and fails a FAILONCE prompt only the first time it sees
// it, so the retry succeeds only if the server sends the identical prompt instead of rewriting again.
test("retrying a failed run reuses its rewritten prompt", async ({ page }, info) => {
  const text = `Ảnh FAILONCE thử lại ${info.project.name}`
  await page.goto("/")
  await prompt(page).fill(text)
  await page.keyboard.press("Enter")
  const run = card(page, text)
  const alert = run.getByRole("alert")
  await expect(alert).toBeVisible({ timeout: 15_000 })
  await alert.getByRole("button", { name: "Thử lại" }).click()
  await expect(run.getByRole("button", { name: /^Mở ảnh 1 trên/ })).toBeVisible({ timeout: 15_000 })
  await expect(run.getByRole("alert")).toHaveCount(0)
})

test("a second press while a run is being prepared starts nothing more", async ({ page, isMobile }, info) => {
  let posts = 0
  // Preparing a run (prompt rewrite, references) takes a few seconds in production; hold it here.
  await page.route(isMobile ? "**/api/images/generations" : "**/api/projects/*/messages", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    posts++
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })
  await page.goto("/")
  // Per project, so the other project's run in the shared history is not counted.
  const text = `Một chiếc thuyền giấy trên mặt hồ ${info.project.name}`
  await prompt(page).fill(text)
  const generate = generateButton(page, isMobile)
  // Two presses in the same moment, well before the server answers the first.
  await generate.evaluate((button: HTMLButtonElement) => {
    button.click()
    button.click()
  })
  // The work shows at once and the button is held: a run being prepared in the gallery on phones,
  // the assistant thinking on wide screens.
  if (isMobile) await expect(card(page, text)).toContainText("Đang chuẩn bị…")
  if (!isMobile) await expect(page.getByRole("log")).toContainText("Đang suy nghĩ…")
  await expect(generate).toBeDisabled({ timeout: 500 })
  await expect(card(page, text).getByRole("button", { name: /^Mở ảnh/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("article", { name: text })).toHaveCount(1)
  expect(posts).toBe(1)
})

// Phones drop a quiet stream or suspend the page while a picture renders. Here the stream stops
// right after the run starts; the tile must still end with the picture the server made, not spin.
test("a run whose stream breaks off still shows its picture", async ({ page, isMobile }, info) => {
  const started = isMobile ? "start" : "generation-start"
  await page.route(isMobile ? "**/api/images/generations" : "**/api/projects/*/messages", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    const response = await route.fetch()
    const frames = (await response.text()).split("\n\n")
    const cut = frames.findIndex((frame) => frame.startsWith(`event: ${started}\n`))
    await route.fulfill({ response, body: `${frames.slice(0, cut + 1).join("\n\n")}\n\n` })
  })
  await page.goto("/")
  const text = `Một ngọn hải đăng trong sương sớm ${info.project.name}`
  await prompt(page).fill(text)
  await page.keyboard.press("Enter")
  await expect(card(page, text).getByRole("button", { name: /^Mở ảnh 1/ })).toBeVisible({ timeout: 20_000 })
  await expect(card(page, text)).toHaveAttribute("aria-busy", "false")
})

// A 600 × 400 JPEG whose EXIF tag says to turn it a quarter clockwise, as a phone saves a photo taken
// upright.
async function rotatedPhoto(page: Page) {
  const { buffer } = await photo(page, 600, 400)
  const exif = Buffer.concat([
    // APP1, 34 bytes long, holding Exif data.
    Buffer.from([0xff, 0xe1, 0x00, 0x22]),
    Buffer.from("Exif\0\0", "binary"),
    // A big-endian TIFF header, then one entry: Orientation (0x0112), a SHORT, value 6.
    Buffer.from([0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08]),
    Buffer.from([0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, 0x06, 0x00, 0x00]),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
  ])
  return {
    name: "phone.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.concat([buffer.subarray(0, 2), exif, buffer.subarray(2)]),
  }
}

// The size a JPEG's frame header gives.
function jpegSize(bytes: Buffer) {
  const at = bytes.findIndex((byte, i) => byte === 0xff && [0xc0, 0xc1, 0xc2].includes(bytes[i + 1] ?? 0))
  return { width: bytes.readUInt16BE(at + 7), height: bytes.readUInt16BE(at + 5) }
}

// Some image models ignore the EXIF rotation, and the same metadata holds where the photo was taken.
test("a reference photo goes up upright and without its metadata", async ({ page }) => {
  await page.goto("/")
  await page.locator('input[type="file"]').setInputFiles(await rotatedPhoto(page))
  const thumb = page.getByRole("list", { name: "Ảnh tham chiếu" }).getByRole("img")
  await expect(thumb).toBeVisible({ timeout: 15_000 })
  const stored = await (await page.request.get((await thumb.getAttribute("src"))!)).body()
  expect(stored.includes("Exif")).toBe(false)
  expect(jpegSize(stored)).toEqual({ width: 400, height: 600 })
})

test("a large reference photo is scaled to what the chosen model takes", async ({ page, isMobile }) => {
  await page.goto("/")
  // A 24-megapixel photo, larger than the image models accept. GPT Image takes a 4096px edge.
  await page.locator('input[type="file"]').setInputFiles(await photo(page, 6000, 4000))
  const thumb = page.getByRole("list", { name: "Ảnh tham chiếu" }).getByRole("img")
  await expect(thumb).toBeVisible()
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(4096)
  expect(await thumb.evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(2731)

  // Nano Banana takes 3072px: switching models scales the stored copy down again.
  await pickModel(page, isMobile, "Nano Banana")
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth), { timeout: 10_000 }).toBe(3072)
  expect(await thumb.evaluate((img: HTMLImageElement) => img.naturalHeight)).toBe(2048)
})

test("every quality fits inside the options panel", async ({ page, isMobile }) => {
  await page.goto("/")
  const panel = await openOptions(page, isMobile, "Chất lượng")
  const quality = panel.getByRole("radiogroup", { name: "Chất lượng" })
  await expect(quality.getByRole("radio")).toHaveCount(5)
  const frame = await panel.boundingBox()
  if (!frame) throw new Error("options panel not laid out")
  for (const choice of await quality.locator("label").all()) {
    const box = await choice.boundingBox()
    if (!box) throw new Error("quality choice not laid out")
    expect(box.x).toBeGreaterThanOrEqual(frame.x)
    expect(box.x + box.width).toBeLessThanOrEqual(frame.x + frame.width)
  }
})

// iPhone keeps pictures in Photos, and a download strands the Home Screen app on a file preview with
// no way back; there Download hands the picture to the share sheet ("Lưu hình ảnh"). A computer
// downloads it, even one whose browser could share.
test("the viewer saves a picture through the share sheet on iPhone and downloads it elsewhere", async ({
  page,
  isMobile,
}) => {
  await recordShares(page)
  await page.goto("/")
  const text = `Ảnh để lưu về máy ${isMobile ? "phone" : "desktop"}`
  await prompt(page).fill(text)
  await page.keyboard.press("Enter")
  const first = card(page, text).getByRole("button", { name: /^Mở ảnh 1 trên/ })
  await expect(first).toBeVisible({ timeout: 15_000 })
  await first.click()
  const viewer = page.getByRole("dialog")
  if (!isMobile) {
    const link = viewer.getByRole("link", { name: "Tải về" })
    await expect(link).toHaveAttribute("download", "")
    await expect(link).toHaveAttribute("href", /^\/api\/images\/files\/\w+\?download$/)
    return
  }
  await viewer.getByRole("button", { name: "Tải về" }).click()
  await expect(page.locator("body")).toHaveAttribute(
    "data-shared",
    /^\[\{"name":"amberpix-\w+\.png","type":"image\/png","size":[1-9]\d*\}\]$/,
  )
  // Nothing navigated: the viewer is still open over the studio.
  await expect(viewer).toBeVisible()
  await expect(page).toHaveURL(STUDIO)
})

test("switching models changes the price", async ({ page, isMobile }) => {
  await page.goto("/")
  await prompt(page).fill("Phác thảo nhanh một ngọn hải đăng")
  await expect(generateButton(page, isMobile, 3)).toBeEnabled()
  // FLUX 1K costs 1 credit a picture.
  await pickModel(page, isMobile, "FLUX 3 Klein")
  await expect(generateButton(page, isMobile, 1)).toBeEnabled()
})

// OpenRouter bills the pictures GPT Image and Gemini read, but not FLUX 3 Klein's, and so do we.
test("a reference picture adds a credit, except on FLUX", async ({ page, isMobile }) => {
  await page.goto("/")
  await prompt(page).fill("Đổi nền ảnh này sang bãi biển")
  await page.locator('input[type="file"]').setInputFiles(await photo(page, 1200, 800))
  // The upload is slower while the whole suite runs at once.
  await expect(page.getByRole("list", { name: "Ảnh tham chiếu" }).getByRole("img")).toBeVisible({ timeout: 15_000 })
  await expect(generateButton(page, isMobile, 4)).toBeEnabled()
  await pickModel(page, isMobile, "FLUX 3 Klein")
  await expect(generateButton(page, isMobile, 1)).toBeEnabled()
})

// Yellow means ready: with nothing to make, the button greys out rather than fading to olive.
test("the generate button turns yellow once there is a prompt", async ({ page, isMobile }) => {
  await page.goto("/")
  const generate = generateButton(page, isMobile)
  await expect(generate).toBeDisabled()
  await expect(generate).toHaveCSS("background-color", "rgba(255, 255, 255, 0.1)")
  await expect(generate).toHaveCSS("background-image", "none")
  await prompt(page).fill("Một ngọn hải đăng lúc bình minh")
  await expect(generate).toBeEnabled()
  await expect(generate).toHaveCSS("background-color", "rgb(255, 214, 10)")
  // Glossy amber, lit from above.
  await expect(generate).toHaveCSS("background-image", /^linear-gradient/)
  await expect(generate).toHaveCSS("opacity", "1")
})

test("the library steps through every picture in the viewer", async ({ page }) => {
  await page.goto("/")
  await prompt(page).fill("Hai ảnh cho thư viện")
  await page.keyboard.press("Enter")
  await expect(card(page, "Hai ảnh cho thư viện").getByRole("button", { name: /^Mở ảnh 1 trên/ })).toBeVisible({
    timeout: 15_000,
  })

  await page.goto("/library")
  const tiles = page
    .getByRole("main")
    .getByRole("button", { name: /\S/ })
    .filter({ has: page.locator("img") })
  await expect(tiles.first()).toBeVisible()
  const total = await tiles.count()
  expect(total).toBeGreaterThan(1)
  await tiles.first().click()
  const viewer = page.getByRole("dialog")
  await expect(viewer).toContainText(`1 / ${total}`)
  await page.keyboard.press("ArrowRight")
  await expect(viewer).toContainText(`2 / ${total}`)
  await viewer.getByRole("button", { name: "Đóng" }).click()
  await expect(viewer).toBeHidden()
})

test.describe("free account", () => {
  test.use({ storageState: STATE })

  test("the studio explains the upgrade instead of offering a dead composer", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { name: "Tạo ảnh dành cho gói trả phí" })).toBeVisible()
    await expect(prompt(page)).toBeDisabled()
    await expect(page.getByRole("link", { name: "Xem bảng giá" })).toHaveCount(2)
  })
})
