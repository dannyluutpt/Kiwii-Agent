import { expect, test, type Page } from "./fixtures"
import { PRO_STATE, STATE } from "./global-setup"

// The image studio and library against the mock OpenRouter, as a paid account with credits.
test.use({ storageState: PRO_STATE })

const prompt = (page: Page) => page.getByRole("textbox", { name: /^Mô tả bức ảnh/ })
const card = (page: Page, text: string) => page.getByRole("article", { name: text }).first()

// Options live in a popover on wide screens and in a bottom sheet on phones; both are labelled dialogs.
async function chooseOptions(page: Page, isMobile: boolean, choice: { ratio: string; count: string }) {
  await page.getByRole("button", { name: /^Tuỳ chọn:/ }).click()
  const panel = page.getByRole("dialog", { name: "Tuỳ chọn" })
  await panel
    .locator("label")
    .filter({ hasText: new RegExp(`^${choice.ratio}$`) })
    .click()
  await panel
    .locator("label")
    .filter({ hasText: new RegExp(`^${choice.count}$`) })
    .click()
  await expect(panel.getByRole("radio", { name: choice.ratio })).toBeChecked()
  if (isMobile) await panel.getByRole("button", { name: "Xong" }).click()
  if (!isMobile) await page.keyboard.press("Escape")
  await expect(panel).toBeHidden()
}

test("a run streams into the feed and its pictures open in the viewer", async ({ page, isMobile }) => {
  await page.goto("/images")
  await chooseOptions(page, isMobile, { ratio: "3:4", count: "2" })
  await expect(page.getByRole("button", { name: /^Tuỳ chọn:/ })).toHaveAccessibleName(/3:4 · 2 ảnh/)

  const text = `Chú mèo cam trên bậu cửa sổ ${isMobile ? "phone" : "desktop"}`
  await prompt(page).fill(text)
  // Two Standard GPT pictures at 3 credits each.
  await page.getByRole("button", { name: "Tạo ảnh, 6 credit" }).click()
  await expect(prompt(page)).toHaveValue("")

  const run = card(page, text)
  await expect(run.getByRole("button", { name: "Mở ảnh 2 trên 2" })).toBeVisible({ timeout: 15_000 })
  await expect(run.getByRole("button", { name: "Mở ảnh 1 trên 2" })).toBeVisible()

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

test("a run can be reused, retried after a failure and deleted", async ({ page }, info) => {
  // Each project gets its own prompt: runs from the other project stay in the shared history.
  const text = `Ảnh lỗi FAIL để thử lại ${info.project.name}`
  await page.goto("/images")
  await prompt(page).fill(text)
  await page.keyboard.press("Enter")
  const failed = card(page, text)
  const alert = failed.getByRole("alert")
  await expect(alert).toBeVisible({ timeout: 15_000 })
  await expect(alert).toContainText("Đã hoàn")

  const runs = page.getByRole("article", { name: text })
  await alert.getByRole("button", { name: "Thử lại" }).click()
  await expect(runs).toHaveCount(2)

  await failed.getByRole("button", { name: "Dùng lại prompt" }).click()
  await expect(prompt(page)).toHaveValue(text)
  await expect(prompt(page)).toBeFocused()

  await expect(runs.first().getByRole("alert")).toBeVisible({ timeout: 15_000 })
  await runs.first().getByRole("button", { name: "Thao tác khác" }).click()
  await page.getByRole("menuitem", { name: "Xoá" }).click()
  const confirm = page.getByRole("dialog", { name: "Xoá lượt tạo này?" })
  await confirm.getByRole("button", { name: "Xoá" }).click()
  await expect(confirm).toBeHidden()
  await expect(runs).toHaveCount(1)
})

test("the model menu switches models and the price follows", async ({ page, isMobile }) => {
  test.skip(isMobile, "phones pick the model in the options sheet")
  await page.goto("/images")
  await page.getByRole("button", { name: /^Model:/ }).click()
  await page.getByRole("menuitemradio", { name: /FLUX 3 Klein/ }).click()
  await expect(page.getByRole("button", { name: "Model: FLUX 3 Klein" })).toBeVisible()
  await prompt(page).fill("Phác thảo nhanh một ngọn hải đăng")
  // FLUX 1K costs 1 credit a picture; the run keeps the count chosen earlier.
  await expect(page.getByRole("button", { name: /^Tạo ảnh, \d+ credit$/ })).toBeEnabled()
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
