import { expect, recordShares, test, type Page } from "./fixtures"
import { PRO_STATE, STATE } from "./global-setup"

// The image studio and library against the mock OpenRouter, as a paid account with credits.
test.use({ storageState: PRO_STATE })

const prompt = (page: Page) => page.getByRole("textbox", { name: /^Mô tả bức ảnh/ })
const card = (page: Page, text: string) => page.getByRole("article", { name: text }).first()

// Every option sits in the control panel on wide screens (a labelled form) and in a bottom sheet
// on phones, opened from the chip under the prompt.
async function openOptions(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: /^Tuỳ chọn:/ }).click()
  return isMobile ? page.getByRole("dialog", { name: "Tuỳ chọn" }) : page.getByRole("form", { name: "Tuỳ chọn" })
}

async function closeOptions(page: Page, isMobile: boolean) {
  if (!isMobile) return
  const sheet = page.getByRole("dialog", { name: "Tuỳ chọn" })
  await sheet.getByRole("button", { name: "Xong" }).click()
  await expect(sheet).toBeHidden()
}

async function chooseOptions(page: Page, isMobile: boolean, choice: { ratio: string; count: string }) {
  const panel = await openOptions(page, isMobile)
  await panel
    .locator("label")
    .filter({ hasText: new RegExp(`^${choice.ratio}$`) })
    .click()
  await panel
    .locator("label")
    .filter({ hasText: new RegExp(`^${choice.count}$`) })
    .click()
  await expect(panel.getByRole("radio", { name: choice.ratio })).toBeChecked()
  // Rewriting the prompt is the server's call, so the panel offers no switch for it.
  await expect(panel.getByRole("switch")).toHaveCount(0)
  await closeOptions(page, isMobile)
}

async function pickModel(page: Page, isMobile: boolean, name: string) {
  const panel = await openOptions(page, isMobile)
  // The radio input is visually hidden; its label is what a person taps.
  await panel.getByRole("radiogroup", { name: "Model" }).locator("label").filter({ hasText: name }).click()
  await expect(panel.getByRole("radio", { name: new RegExp(name) })).toBeChecked()
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
  await page.goto("/images")
  await chooseOptions(page, isMobile, { ratio: "3:4", count: "2" })
  if (isMobile) await expect(page.getByRole("button", { name: /^Tuỳ chọn:/ })).toHaveAccessibleName(/3:4 · 2 ảnh/)

  const text = `Chú mèo cam trên bậu cửa sổ ${isMobile ? "phone" : "desktop"}`
  await prompt(page).fill(text)
  // Two Standard GPT pictures at 3 credits each.
  await page.getByRole("button", { name: "Tạo ảnh, 6 credit" }).click()
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
  await page.goto("/images")
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
  await page.goto("/images")
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
  await page.goto("/images")
  await prompt(page).fill(text)
  await page.keyboard.press("Enter")
  const run = card(page, text)
  const alert = run.getByRole("alert")
  await expect(alert).toBeVisible({ timeout: 15_000 })
  await alert.getByRole("button", { name: "Thử lại" }).click()
  await expect(run.getByRole("button", { name: /^Mở ảnh 1 trên/ })).toBeVisible({ timeout: 15_000 })
  await expect(run.getByRole("alert")).toHaveCount(0)
})

test("a second press while a run is being prepared starts nothing more", async ({ page }, info) => {
  let posts = 0
  // Preparing a run (prompt rewrite, references) takes a few seconds in production; hold it here.
  await page.route("**/api/images/generations", async (route) => {
    if (route.request().method() !== "POST") return route.continue()
    posts++
    await new Promise((resolve) => setTimeout(resolve, 1500))
    await route.continue()
  })
  await page.goto("/images")
  // Per project, so the other project's run in the shared history is not counted.
  const text = `Một chiếc thuyền giấy trên mặt hồ ${info.project.name}`
  await prompt(page).fill(text)
  const generate = page.getByRole("button", { name: /^Tạo ảnh, \d+ credit$/ })
  // Two presses in the same moment, well before the server answers the first.
  await generate.evaluate((button: HTMLButtonElement) => {
    button.click()
    button.click()
  })
  // The gallery shows the run at once, marked as being prepared, and the button is held.
  await expect(card(page, text)).toContainText("Đang chuẩn bị…")
  await expect(generate).toBeDisabled({ timeout: 500 })
  await expect(card(page, text).getByRole("button", { name: /^Mở ảnh/ })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole("article", { name: text })).toHaveCount(1)
  expect(posts).toBe(1)
})

test("a large reference photo is scaled to what the chosen model takes", async ({ page, isMobile }) => {
  await page.goto("/images")
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
  await page.goto("/images")
  const panel = await openOptions(page, isMobile)
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
  await page.goto("/images")
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
  await expect(page).toHaveURL(/\/images$/)
})

test("switching models changes the price", async ({ page, isMobile }) => {
  await page.goto("/images")
  await prompt(page).fill("Phác thảo nhanh một ngọn hải đăng")
  await expect(page.getByRole("button", { name: "Tạo ảnh, 3 credit" })).toBeEnabled()
  // FLUX 1K costs 1 credit a picture.
  await pickModel(page, isMobile, "FLUX 3 Klein")
  await expect(page.getByRole("button", { name: "Tạo ảnh, 1 credit" })).toBeEnabled()
})

// Yellow means ready: with nothing to make, the button greys out rather than fading to olive.
test("the generate button turns yellow once there is a prompt", async ({ page }) => {
  await page.goto("/images")
  const generate = page.getByRole("button", { name: /^Tạo ảnh, \d+ credit$/ })
  await expect(generate).toBeDisabled()
  await expect(generate).toHaveCSS("background-color", "rgba(255, 255, 255, 0.1)")
  await prompt(page).fill("Một ngọn hải đăng lúc bình minh")
  await expect(generate).toBeEnabled()
  await expect(generate).toHaveCSS("background-color", "rgb(255, 214, 10)")
  await expect(generate).toHaveCSS("opacity", "1")
})

test("the library steps through every picture in the viewer", async ({ page }) => {
  await page.goto("/images")
  await prompt(page).fill("Hai ảnh cho thư viện")
  await page.keyboard.press("Enter")
  await expect(card(page, "Hai ảnh cho thư viện").getByRole("button", { name: /^Mở ảnh 1 trên/ })).toBeVisible({
    timeout: 15_000,
  })

  await page.goto("/images/assets")
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
    await page.goto("/images")
    await expect(page.getByRole("heading", { name: "Tạo ảnh dành cho gói trả phí" })).toBeVisible()
    await expect(prompt(page)).toBeDisabled()
    await expect(page.getByRole("link", { name: "Xem bảng giá" })).toHaveCount(2)
  })
})
