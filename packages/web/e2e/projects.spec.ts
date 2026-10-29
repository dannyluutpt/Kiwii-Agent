import { expect, test, type Page } from "./fixtures"
import { PRO_STATE } from "./global-setup"

// Projects live in the desktop sidebar; phones make pictures straight into "all".
test.use({ storageState: PRO_STATE })
test.skip(({ isMobile }) => isMobile, "projects are a desktop layout")

const prompt = (page: Page) => page.getByRole("textbox", { name: /^Mô tả bức ảnh/ })
const card = (page: Page, text: string) => page.getByRole("article", { name: text }).first()
const sidebar = (page: Page) => page.getByRole("navigation", { name: "Điều hướng chính" })

async function newProject(page: Page) {
  await sidebar(page).getByRole("button", { name: "Dự án mới", exact: true }).click()
  await expect(page).toHaveURL(/\/p\/\w+$/)
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dự án mới")
}

test("a project gathers its runs, is named after its first prompt and keeps them when deleted", async ({ page }) => {
  // Short enough to be the project's whole name.
  const text = `Hải đăng lúc bình minh ${Date.now() % 100_000}`
  await page.goto("/")
  await newProject(page)
  const address = page.url()
  await prompt(page).fill(text)
  await page.keyboard.press("Enter")
  await expect(card(page, text).getByRole("button", { name: /^Mở ảnh 1 trên/ })).toBeVisible({ timeout: 15_000 })

  // The first run names the project, in the title and in the sidebar.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(text)
  const row = sidebar(page).getByRole("link", { name: text })
  await expect(row).toHaveAttribute("href", new URL(address).pathname)

  // Another project starts empty; everything shows under "all".
  await newProject(page)
  await expect(page.getByRole("article")).toHaveCount(0)
  await expect(page.getByRole("heading", { name: "Mô tả bức ảnh bạn muốn" })).toBeVisible()
  await sidebar(page).getByRole("link", { name: "Tất cả dự án" }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tất cả dự án")
  await expect(card(page, text)).toBeVisible()

  // Renamed from its menu.
  await row.hover()
  await sidebar(page)
    .getByRole("button", { name: `Tuỳ chọn cho “${text}”` })
    .click()
  await page.getByRole("menuitem", { name: "Đổi tên" }).click()
  const rename = page.getByRole("dialog", { name: "Đổi tên dự án" })
  await rename.getByRole("textbox").fill("Bộ ảnh hải đăng")
  await rename.getByRole("button", { name: "Lưu" }).click()
  const renamed = sidebar(page).getByRole("link", { name: "Bộ ảnh hải đăng" })
  await expect(renamed).toBeVisible()

  // Deleted while open: back to "all", where its run still is.
  await renamed.click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bộ ảnh hải đăng")
  await sidebar(page).getByRole("button", { name: "Tuỳ chọn cho “Bộ ảnh hải đăng”" }).click()
  await page.getByRole("menuitem", { name: "Xoá" }).click()
  const confirm = page.getByRole("dialog", { name: "Xoá dự án này?" })
  await expect(confirm).toContainText("vẫn được giữ lại")
  await confirm.getByRole("button", { name: "Xoá" }).click()
  await expect(page).toHaveURL(/^[^?#]*:\d+\/$/)
  await expect(sidebar(page).getByRole("link", { name: "Bộ ảnh hải đăng" })).toHaveCount(0)
  await expect(card(page, text)).toBeVisible()
  await page.reload()
  await expect(card(page, text)).toBeVisible()
})

test("a run keeps streaming into its project while another one is open", async ({ page }) => {
  const text = `Thuyền buồm trên vịnh ${Date.now() % 100_000}`
  await page.goto("/")
  await newProject(page)
  const address = new URL(page.url()).pathname
  await prompt(page).fill(text)
  await page.keyboard.press("Enter")
  await expect(card(page, text)).toHaveAttribute("aria-busy", "true")
  // Away before the picture lands, then back.
  await sidebar(page).getByRole("link", { name: "Tất cả dự án" }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tất cả dự án")
  await page.locator(`a[href="${address}"]`).first().click()
  await expect(card(page, text).getByRole("button", { name: /^Mở ảnh 1 trên/ })).toBeVisible({ timeout: 15_000 })
  await expect(card(page, text)).toHaveAttribute("aria-busy", "false")
})

test("searching finds a project without its accents", async ({ page }) => {
  await page.goto("/")
  await newProject(page)
  await prompt(page).fill(`Đèn lồng Hội An ${Date.now() % 100_000}`)
  await page.keyboard.press("Enter")
  await expect(sidebar(page).getByRole("link", { name: /^Đèn lồng Hội An/ })).toBeVisible({ timeout: 15_000 })
  await page.keyboard.press("ControlOrMeta+K")
  const search = sidebar(page).getByRole("searchbox", { name: "Tìm dự án" })
  await expect(search).toBeFocused()
  await search.fill("den long hoi an")
  await expect(sidebar(page).getByRole("link", { name: /^Đèn lồng Hội An/ })).toBeVisible()
  await search.fill("khong co du an nay")
  await expect(sidebar(page)).toContainText("Không có dự án nào khớp.")
})
