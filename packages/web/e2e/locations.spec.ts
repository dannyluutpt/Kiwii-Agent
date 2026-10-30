import { expect, test, type Page } from "./fixtures"
import { PRO_STATE } from "./global-setup"

// Saved locations against the mock OpenRouter, as a paid account with credits.
test.use({ storageState: PRO_STATE })

const prompt = (page: Page) => page.getByRole("textbox", { name: /^Mô tả bức ảnh/ })
const card = (page: Page, text: string) => page.getByRole("article", { name: text }).first()
const filter = (page: Page, name: string) =>
  page.getByRole("group", { name: "Lọc sản phẩm" }).getByRole("button", { name }).click()
const locationCard = (page: Page, name: string) =>
  page.getByRole("list", { name: "Bối cảnh" }).getByRole("listitem").filter({ hasText: name })
// Phones make pictures straight from the composer; wide screens ask the assistant.
const generateButton = (page: Page, isMobile: boolean, cost: number) =>
  page.getByRole("button", { name: `${isMobile ? "Tạo ảnh, " : "Gửi, từ "}${cost} credit` })

// The project runs on desktop and phone at the same time with one account, so names are unique.
const unique = (base: string, project: string) => `${base} ${project.slice(0, 1)}${Date.now() % 100_000}`

// A wide photo drawn in the page, so the test needs no fixture file.
async function photo(page: Page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas")
    canvas.width = 800
    canvas.height = 600
    const context = canvas.getContext("2d")!
    context.fillStyle = "#4a7"
    context.fillRect(0, 0, 800, 600)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.8))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  return { name: "place.jpg", mimeType: "image/jpeg", buffer: Buffer.from(bytes) }
}

test("a picture saved as a location can be picked, and the next run is set there", async ({
  page,
  isMobile,
}, testInfo) => {
  const name = unique("Quán Gió", testInfo.project.name)
  await page.goto("/")
  await prompt(page).fill(`Góc ${name}`)
  await page.keyboard.press("Enter")
  const tile = card(page, `Góc ${name}`)
  await expect(tile.getByRole("button", { name: /^Mở ảnh 1 trên/ })).toBeVisible({ timeout: 15_000 })

  await tile.getByRole("button", { name: "Thao tác khác" }).click()
  await page.getByRole("menuitem", { name: "Lưu thành bối cảnh" }).click()
  const dialog = page.getByRole("dialog", { name: "Tạo bối cảnh" })
  await expect(dialog.getByRole("list", { name: "Ảnh bối cảnh" }).getByRole("img")).toHaveCount(1)
  await dialog.getByRole("textbox", { name: "Tên bối cảnh" }).fill(name)
  await dialog.getByRole("button", { name: "Lưu", exact: true }).click()
  await expect(dialog).toBeHidden()

  await filter(page, "Bối cảnh")
  const saved = locationCard(page, name)
  await saved.getByRole("button", { name: "Dùng" }).click()
  await expect(saved.getByRole("button", { name: "Đang dùng" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("list", { name: "Đang dùng" })).toContainText(name)

  // GPT Image Standard is 3 credits; the location's photo is read like a reference: +1.
  await prompt(page).fill(`Một chú mèo ngủ ở ${name}`)
  await expect(generateButton(page, isMobile, 4)).toBeEnabled()
  await page.keyboard.press("Enter")
  await filter(page, "Tất cả")
  await expect(card(page, `Một chú mèo ngủ ở ${name}`).getByRole("button", { name: /^Mở ảnh 1 trên/ })).toBeVisible({
    timeout: 15_000,
  })
  const locations: { locations: Array<{ id: string; name: string }> } = await (
    await page.request.get("/api/locations")
  ).json()
  const id = locations.locations.find((l) => l.name === name)?.id
  const runs: { generations: Array<{ prompt: string; locationID: string | null }> } = await (
    await page.request.get("/api/images/generations?limit=24")
  ).json()
  const run = runs.generations.find((g) => g.prompt.startsWith(`Một chú mèo ngủ ở ${name}`))
  expect(run?.locationID).toBe(id)
})

test("a location saved from an uploaded photo is picked in the composer, renamed and deleted", async ({
  page,
  isMobile,
}, testInfo) => {
  const name = unique("Phố cổ", testInfo.project.name)
  await page.goto("/")
  await filter(page, "Bối cảnh")
  await page.getByRole("button", { name: "Tạo bối cảnh" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Tạo bối cảnh" })
  await expect(dialog.getByText("Chỉ dùng ảnh của bạn hoặc ảnh bạn có quyền sử dụng.")).toBeVisible()
  await dialog.locator('input[type="file"]').setInputFiles(await photo(page))
  await expect(dialog.getByRole("list", { name: "Ảnh bối cảnh" }).getByRole("img")).toHaveCount(1, {
    timeout: 15_000,
  })
  await dialog.getByRole("textbox", { name: "Tên bối cảnh" }).fill(name)
  await dialog.getByRole("button", { name: "Lưu", exact: true }).click()
  await expect(locationCard(page, name)).toContainText("1 ảnh")

  // The composer picks it: a popover on wide screens, the options sheet on phones.
  if (isMobile) await page.getByRole("button", { name: /^Tuỳ chọn:/ }).click()
  if (!isMobile) await page.getByRole("button", { name: "Bối cảnh: Bối cảnh" }).click()
  const picker = page.getByRole("dialog", { name: isMobile ? "Tuỳ chọn" : "Bối cảnh" })
  await picker.getByRole("button", { name }).click()
  await expect(picker.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true")
  if (isMobile) await page.getByRole("button", { name: "Xong" }).click()
  if (!isMobile) await page.keyboard.press("Escape")
  await expect(page.getByRole("list", { name: "Đang dùng" })).toContainText(name)

  await locationCard(page, name).getByRole("button", { name: "Tuỳ chọn bối cảnh" }).click()
  await page.getByRole("menuitem", { name: "Đổi tên" }).click()
  const rename = page.getByRole("dialog", { name: "Đổi tên bối cảnh" })
  await rename.getByRole("textbox").fill(`${name} mới`)
  await rename.getByRole("button", { name: "Lưu" }).click()
  await expect(locationCard(page, `${name} mới`)).toBeVisible()
  await expect(page.getByRole("list", { name: "Đang dùng" })).toContainText(`${name} mới`)

  await locationCard(page, `${name} mới`).getByRole("button", { name: "Tuỳ chọn bối cảnh" }).click()
  await page.getByRole("menuitem", { name: "Xoá" }).click()
  await page.getByRole("dialog", { name: "Xoá bối cảnh này?" }).getByRole("button", { name: "Xoá" }).click()
  await expect(locationCard(page, `${name} mới`)).toHaveCount(0)
  await expect(page.getByRole("list", { name: "Đang dùng" })).toHaveCount(0)
})
