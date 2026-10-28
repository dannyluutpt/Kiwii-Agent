import { expect, test, type Page } from "./fixtures"
import { PRO_STATE } from "./global-setup"

const composer = (page: Page) => page.getByRole("textbox", { name: "Nhắn cho Kiwii…" })

test("a suggestion fills the composer and the answer streams in", async ({ page }) => {
  await page.goto("/chat")
  await expect(page.getByRole("heading", { name: "Hỏi Kiwii bất cứ điều gì" })).toBeVisible()
  await page.getByRole("button", { name: /^Viết email/ }).click()
  await expect(composer(page)).toHaveValue(/email xin nghỉ phép/)
  await expect(composer(page)).toBeFocused()

  await composer(page).fill("Chào Kiwii, cho tôi một đoạn code ngắn")
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(/\/chat\/[0-9A-Z]+$/)
  await expect(page.getByText("Chào Kiwii, cho tôi một đoạn code ngắn").first()).toBeVisible()

  // The mock answer ends with a bullet list; once it is there the turn is complete.
  await expect(page.getByText("Gạch đầu dòng hai")).toBeVisible()
  await expect(page.getByRole("button", { name: "Sao chép" }).first()).toBeVisible()
  await expect(page.locator(".k-code-head").first()).toContainText("ts")
  await expect(page.getByRole("button", { name: "Tạo lại" })).toBeEnabled()
})

// Tools, the web search among them, come with a paid plan.
test("a question about today sends Kiwii to the web and the answer cites its source", async ({ browser }) => {
  const context = await browser.newContext({ storageState: PRO_STATE })
  const page = await context.newPage()
  await page.goto("/chat")
  await composer(page).fill("Giá vàng hôm nay bao nhiêu?")
  await page.keyboard.press("Enter")
  // The status line names the tool while it runs; the mock then answers from the results.
  await expect(page.getByText("Kiwii đang tìm trên web…")).toBeVisible()
  const source = page.getByRole("main").getByRole("link", { name: "Giá vàng hôm nay", exact: true })
  await expect(source).toBeVisible()
  await expect(source).toHaveAttribute("href", "https://example.com/gia-vang")
  // A source opens on its own so the conversation stays put, in the Home Screen app too.
  await expect(source).toHaveAttribute("target", "_blank")
  await expect(source).toHaveAttribute("rel", "noopener noreferrer")
  await expect(page.getByText("150 triệu đồng")).toBeVisible()
  await context.close()
})

test("finishing an answer refreshes the quota without reloading the screen", async ({ page }) => {
  await page.goto("/chat/e2e-conv-1")
  await expect(page.getByRole("heading", { level: 1, name: "Kế hoạch du lịch Đà Lạt" })).toBeVisible()
  // A remount would replace this element; the mark proves the screen stayed in place.
  await page.locator("main").evaluate((el) => (el.dataset.mark = "kept"))
  const refreshed = page.waitForResponse((response) => response.url().endsWith("/api/auth/session"))
  await composer(page).fill("Xin chào Kiwii")
  await page.keyboard.press("Enter")
  await expect(page.getByText("Gạch đầu dòng hai")).toBeVisible()
  await refreshed
  await expect(page.locator('main[data-mark="kept"]')).toHaveCount(1)
})

test("long answers keep the latest line in view until the person scrolls up", async ({ page, isMobile }) => {
  await page.goto("/chat")
  await composer(page).fill("Kể một câu chuyện dài")
  await page.keyboard.press("Enter")
  await expect(page.getByRole("heading", { name: "Phần 2" })).toBeVisible()

  const scroller = page.locator("main div.overflow-y-auto").first()
  const distanceFromBottom = () => scroller.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)
  // Wait until the answer is taller than the screen, then check it is being followed. The mock writes
  // about 100px a second on a wide screen, so this takes several seconds there.
  await expect
    .poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight), { timeout: 15_000 })
    .toBeGreaterThan(300)
  await expect.poll(distanceFromBottom).toBeLessThan(40)

  // A finger dragging down the screen while the content scrolls back, as a phone reports it.
  if (isMobile)
    await scroller.evaluate((el) => {
      const touch = (type: string, y: number) =>
        el.dispatchEvent(
          new TouchEvent(type, {
            bubbles: true,
            touches: type === "touchend" ? [] : [new Touch({ identifier: 1, target: el, clientY: y })],
          }),
        )
      touch("touchstart", 300)
      touch("touchmove", 700)
      el.scrollBy({ top: -400 })
      touch("touchend", 700)
    })
  if (!isMobile) {
    await scroller.hover()
    await page.mouse.wheel(0, -600)
  }
  const jump = page.getByRole("button", { name: "Cuộn xuống tin mới nhất" })
  await expect(jump).toBeVisible()
  await expect(page.getByRole("heading", { name: "Phần 12" })).toBeVisible({ timeout: 20_000 })
  await jump.click()
  await expect.poll(distanceFromBottom).toBeLessThan(40)
  await expect(jump).toBeHidden()
})

test("a failed answer can be retried in place", async ({ page }) => {
  await page.goto("/chat")
  await composer(page).fill("RATELIMIT xin chào")
  await page.keyboard.press("Enter")
  const alert = page.getByRole("alert").filter({ hasText: "Kiwii chưa trả lời được tin này." })
  await expect(alert).toBeVisible({ timeout: 15_000 })
  await expect(alert.getByRole("button", { name: "Thử lại" })).toBeVisible()
})

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "uses the docked sidebar")

  test("search finds conversations without typing accents", async ({ page }) => {
    await page.goto("/chat")
    await page.keyboard.press("ControlOrMeta+K")
    const search = page.getByRole("searchbox", { name: "Tìm hội thoại" })
    await expect(search).toBeFocused()
    await search.fill("da lat")
    const sidebar = page.getByRole("navigation", { name: "Điều hướng chính" })
    await expect(sidebar.getByRole("link", { name: "Kế hoạch du lịch Đà Lạt" })).toBeVisible()
    await search.fill("không có gì như thế")
    await expect(sidebar.getByText("Không có hội thoại nào khớp.")).toBeVisible()
    await search.press("Escape")
    await expect(search).toHaveValue("")
    await expect(sidebar.getByRole("heading", { name: "Hôm nay" })).toBeVisible()
  })
})
