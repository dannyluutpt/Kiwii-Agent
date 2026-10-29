import { expect, test, type Page } from "./fixtures"
import { PRO_STATE } from "./global-setup"

// Saved characters against the mock OpenRouter, as a paid account with credits.
test.use({ storageState: PRO_STATE })

const prompt = (page: Page) => page.getByRole("textbox", { name: /^Mô tả bức ảnh/ })
const card = (page: Page, text: string) => page.getByRole("article", { name: text }).first()
const showCharacters = (page: Page) =>
  page.getByRole("group", { name: "Lọc sản phẩm" }).getByRole("button", { name: "Nhân vật" }).click()
const characterCard = (page: Page, name: string) =>
  page.getByRole("list", { name: "Nhân vật" }).getByRole("listitem").filter({ hasText: name })
// Phones make pictures straight from the composer; wide screens ask the assistant.
const generateButton = (page: Page, isMobile: boolean, cost: number) =>
  page.getByRole("button", { name: `${isMobile ? "Tạo ảnh, " : "Gửi, từ "}${cost} credit` })

// The project runs on desktop and phone at the same time with one account, so names are unique.
const unique = (base: string, project: string) => `${base} ${project.slice(0, 1)}${Date.now() % 100_000}`

// A photo drawn in the page, so the test needs no fixture file.
async function photo(page: Page) {
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement("canvas")
    canvas.width = 600
    canvas.height = 800
    const context = canvas.getContext("2d")!
    context.fillStyle = "#c84"
    context.fillRect(0, 0, 600, 800)
    const blob = await new Promise<Blob>((resolve) => canvas.toBlob((b) => resolve(b!), "image/jpeg", 0.8))
    return Array.from(new Uint8Array(await blob.arrayBuffer()))
  })
  return { name: "face.jpg", mimeType: "image/jpeg", buffer: Buffer.from(bytes) }
}

test("a picture saved as a character can be picked, and the next run features it", async ({
  page,
  isMobile,
}, testInfo) => {
  const name = unique("Lan", testInfo.project.name)
  await page.goto("/")
  await prompt(page).fill(`Chân dung ${name}`)
  await page.keyboard.press("Enter")
  const tile = card(page, `Chân dung ${name}`)
  await expect(tile.getByRole("button", { name: /^Mở ảnh 1 trên/ })).toBeVisible({ timeout: 15_000 })

  await tile.getByRole("button", { name: "Thao tác khác" }).click()
  await page.getByRole("menuitem", { name: "Lưu thành nhân vật" }).click()
  const dialog = page.getByRole("dialog", { name: "Tạo nhân vật" })
  await expect(dialog.getByRole("list", { name: "Ảnh nhân vật" }).getByRole("img")).toHaveCount(1)
  await dialog.getByRole("textbox", { name: "Tên nhân vật" }).fill(name)
  await dialog.getByRole("button", { name: "Lưu", exact: true }).click()
  await expect(dialog).toBeHidden()

  await showCharacters(page)
  const saved = characterCard(page, name)
  await saved.getByRole("button", { name: "Dùng" }).click()
  await expect(saved.getByRole("button", { name: "Đang dùng" })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("list", { name: "Đang dùng" })).toContainText(name)

  // GPT Image Standard is 3 credits; the character's photo is read like a reference: +1.
  await prompt(page).fill(`${name} đi dạo trong công viên`)
  await expect(generateButton(page, isMobile, 4)).toBeEnabled()
  await page.keyboard.press("Enter")
  await page.getByRole("group", { name: "Lọc sản phẩm" }).getByRole("button", { name: "Tất cả" }).click()
  await expect(
    card(page, `${name} đi dạo trong công viên`).getByRole("button", { name: /^Mở ảnh 1 trên/ }),
  ).toBeVisible({ timeout: 15_000 })
  const characters: { characters: Array<{ id: string; name: string }> } = await (
    await page.request.get("/api/characters")
  ).json()
  const id = characters.characters.find((c) => c.name === name)?.id
  const runs: { generations: Array<{ prompt: string; characterIDs: string[] }> } = await (
    await page.request.get("/api/images/generations?limit=24")
  ).json()
  // The mock assistant's prompt is the message as the model reads it, which names the picked character.
  const run = runs.generations.find((g) => g.prompt.startsWith(`${name} đi dạo trong công viên`))
  expect(run?.characterIDs).toEqual([id])
})

test("a character saved from an uploaded photo can be renamed and deleted", async ({ page }, testInfo) => {
  const name = unique("Minh", testInfo.project.name)
  await page.goto("/")
  await showCharacters(page)
  await page.getByRole("button", { name: "Tạo nhân vật" }).first().click()
  const dialog = page.getByRole("dialog", { name: "Tạo nhân vật" })
  await expect(dialog.getByText("Chỉ dùng ảnh của bạn hoặc ảnh bạn có quyền sử dụng.")).toBeVisible()
  await dialog.locator('input[type="file"]').setInputFiles(await photo(page))
  await expect(dialog.getByRole("list", { name: "Ảnh nhân vật" }).getByRole("img")).toHaveCount(1, {
    timeout: 15_000,
  })
  await dialog.getByRole("textbox", { name: "Tên nhân vật" }).fill(name)
  await dialog.getByRole("button", { name: "Lưu", exact: true }).click()
  await expect(characterCard(page, name)).toContainText("1 ảnh")

  await characterCard(page, name).getByRole("button", { name: "Tuỳ chọn nhân vật" }).click()
  await page.getByRole("menuitem", { name: "Đổi tên" }).click()
  const rename = page.getByRole("dialog", { name: "Đổi tên nhân vật" })
  await rename.getByRole("textbox").fill(`${name} mới`)
  await rename.getByRole("button", { name: "Lưu" }).click()
  await expect(characterCard(page, `${name} mới`)).toBeVisible()

  await characterCard(page, `${name} mới`).getByRole("button", { name: "Tuỳ chọn nhân vật" }).click()
  await page.getByRole("menuitem", { name: "Xoá" }).click()
  await page.getByRole("dialog", { name: "Xoá nhân vật này?" }).getByRole("button", { name: "Xoá" }).click()
  await expect(characterCard(page, `${name} mới`)).toHaveCount(0)
})
