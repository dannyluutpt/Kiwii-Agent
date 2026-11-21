import { expect, test, type Page } from "./fixtures"
import { PRO_STATE } from "./global-setup"

test.use({ storageState: PRO_STATE })

const prompt = (page: Page) => page.getByRole("textbox", { name: /^Mô tả bức ảnh/ })

// Two pictures of this test's own, so what other tests left in the library does not matter.
async function twoPictures(page: Page, isMobile: boolean, tag: string) {
  await page.goto("/")
  for (const name of [`Thư viện chọn một ${tag}`, `Thư viện chọn hai ${tag}`]) {
    await prompt(page).fill(name)
    await page.keyboard.press("Enter")
    const tile = page.getByRole("article", { name }).first()
    await expect(tile.getByRole("button", { name: /^Mở ảnh 1/ })).toBeVisible({ timeout: 20_000 })
    await expect(tile).toHaveAttribute("aria-busy", "false")
    if (!isMobile) await expect(prompt(page)).toBeEnabled()
  }
}

test("several pictures are chosen in the library, deleted together, and brought back with undo", async ({
  page,
  isMobile,
}, info) => {
  const tag = `${info.project.name}${Date.now() % 100_000}`
  await twoPictures(page, isMobile, tag)
  await page.goto("/library")
  // Inside the page: on wide screens the sidebar lists a project of the same name, with a button of its own.
  const tiles = page.getByRole("main")
  const one = tiles.getByRole("button", { name: new RegExp(`Thư viện chọn một ${tag}`) }).first()
  const two = tiles.getByRole("button", { name: new RegExp(`Thư viện chọn hai ${tag}`) }).first()
  await expect(one).toBeVisible()

  await page.getByRole("button", { name: "Chọn", exact: true }).click()
  await one.click()
  await two.click()
  await expect(one).toHaveAttribute("aria-pressed", "true")
  const bar = page.getByRole("toolbar", { name: "Đã chọn 2" })
  await bar.getByRole("button", { name: "Xoá" }).click()
  await expect(one).toHaveCount(0)
  await expect(two).toHaveCount(0)

  // Undo: nothing was sent yet, and both are back.
  await page.getByRole("button", { name: "Hoàn tác" }).click()
  await expect(one).toBeVisible()
  await expect(two).toBeVisible()

  // Deleted for good once the six seconds pass: gone after a reload too.
  await page.getByRole("button", { name: "Chọn", exact: true }).click()
  await one.click()
  const sent = page.waitForResponse(
    (res) => res.request().method() === "DELETE" && res.url().includes("/api/images/assets/"),
  )
  await page.getByRole("toolbar", { name: "Đã chọn 1" }).getByRole("button", { name: "Xoá" }).click()
  expect((await sent).status()).toBe(200)
  await page.reload()
  await expect(two).toBeVisible()
  await expect(one).toHaveCount(0)
})
