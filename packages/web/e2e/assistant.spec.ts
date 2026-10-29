import { expect, test, type Page } from "./fixtures"
import { PRO_STATE } from "./global-setup"

// The image assistant on wide screens, against the mock OpenRouter (script/mock-openrouter.ts): a
// greeting gets words, "2 phương án" two runs, "đổi" works from the newest picture, BLOCKME is
// refused by the screener, anything else is one run with the message as its prompt.
test.use({ storageState: PRO_STATE })
test.skip(({ isMobile }) => isMobile, "the assistant is the desktop layout")

const composer = (page: Page) => page.getByRole("textbox", { name: /^Mô tả bức ảnh/ })
const log = (page: Page) => page.getByRole("log", { name: "Hội thoại với trợ lý" })
const card = (page: Page, text: string) => page.getByRole("article", { name: text }).first()
const tag = () => String(Date.now() % 100_000)

async function say(page: Page, text: string) {
  await composer(page).fill(text)
  await page.keyboard.press("Enter")
  await expect(composer(page)).toHaveValue("")
}

test("a message from all opens a project, where the assistant makes the picture and remembers", async ({ page }) => {
  const text = `Ngọn hải đăng trên vách đá ${tag()}`
  await page.goto("/")
  await expect(log(page)).toContainText("Xin chào, bạn muốn tạo gì?")
  await say(page, text)
  await expect(page).toHaveURL(/\/p\/\w+$/)
  // The project takes the message as its name.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(text)

  await expect(log(page)).toContainText(text)
  await expect(log(page)).toContainText("Xong rồi!")
  await expect(log(page).getByRole("button", { name: "Mở ảnh 1 trên 1" })).toBeVisible({ timeout: 15_000 })
  await expect(card(page, text).getByRole("button", { name: "Mở ảnh 1 trên 1" })).toBeVisible()

  // A picture in the conversation opens in the viewer.
  await log(page).getByRole("button", { name: "Mở ảnh 1 trên 1" }).click()
  const viewer = page.getByRole("dialog")
  await expect(viewer.getByRole("img")).toHaveAttribute("alt", text)
  await page.keyboard.press("Escape")

  // The conversation is kept with the project.
  await page.reload()
  await expect(log(page)).toContainText(text)
  await expect(log(page).getByRole("button", { name: "Mở ảnh 1 trên 1" })).toBeVisible()
})

test("changing the picture works from the previous one", async ({ page }) => {
  await page.goto("/")
  await say(page, `Chiếc xe đạp cũ dựa tường ${tag()}`)
  await expect(log(page).getByRole("button", { name: "Mở ảnh 1 trên 1" })).toBeVisible({ timeout: 15_000 })
  const project = new URL(page.url()).pathname.split("/").at(-1)

  await say(page, "Đổi nền sang hoàng hôn")
  await expect(log(page).getByRole("button", { name: "Mở ảnh 1 trên 1" })).toHaveCount(2, { timeout: 15_000 })
  const runs = (await (await page.request.get(`/api/images/generations?project=${project}`)).json()) as {
    generations: Array<{ referenceFileIDs: string[]; images: Array<{ fileID: string }> }>
  }
  const [edited, first] = runs.generations
  expect(edited?.referenceFileIDs).toEqual([first?.images[0]?.fileID])
})

test("two options make two runs", async ({ page }) => {
  const text = `Logo quán cà phê, 2 phương án ${tag()}`
  await page.goto("/")
  await say(page, text)
  await expect(card(page, `${text}, phương án 1`).getByRole("button", { name: /^Mở ảnh 1/ })).toBeVisible({
    timeout: 15_000,
  })
  await expect(card(page, `${text}, phương án 2`).getByRole("button", { name: /^Mở ảnh 1/ })).toBeVisible()
})

test("a refused prompt is explained and costs nothing", async ({ page }) => {
  await page.goto("/")
  const before = ((await (await page.request.get("/api/auth/me")).json()) as { credits: number }).credits
  await say(page, `Vẽ BLOCKME ${tag()}`)
  await expect(log(page)).toContainText("Mình chưa tạo được ảnh này")
  await expect(log(page)).toContainText("Nội dung không được phép (mock)")
  await expect(page.getByRole("article")).toHaveCount(0)
  const after = ((await (await page.request.get("/api/auth/me")).json()) as { credits: number }).credits
  expect(after).toBe(before)
})

test("a greeting gets an answer, not a picture", async ({ page }) => {
  await page.goto("/")
  await say(page, "Xin chào")
  await expect(log(page)).toContainText("Chào bạn! Bạn muốn tạo ảnh gì hôm nay?")
  await expect(page.getByRole("article")).toHaveCount(0)
})
