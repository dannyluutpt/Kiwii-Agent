import { expect, test } from "./fixtures"
import { PRO_STATE } from "./global-setup"

// What a customer needs outside the studio: the policies, and the invitation link.

test.describe("visitor", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("the policies are public, linked from the footer and named in the tab", async ({ page }) => {
    await page.goto("/")
    const footer = page.getByRole("contentinfo")
    await expect(footer.getByRole("link", { name: "Hỗ trợ" })).toBeVisible()
    await footer.getByRole("link", { name: "Chính sách hoàn tiền" }).click()
    await expect(page).toHaveURL(/\/refund$/)
    await expect(page.getByRole("heading", { level: 1, name: "Chính sách hoàn tiền" })).toBeVisible()
    await expect(page).toHaveTitle("Chính sách hoàn tiền · Amberpix")
    for (const [path, name] of [
      ["/terms", "Điều khoản sử dụng"],
      ["/privacy", "Chính sách quyền riêng tư"],
    ] as const) {
      await page.goto(path)
      await expect(page.getByRole("heading", { level: 1, name })).toBeVisible()
    }
  })

  test("signing up names the terms, and sends the code of whoever invited the visitor", async ({ page }) => {
    await page.goto("/?ref=abcdefgh")
    await page.goto("/signup")
    await expect(page.getByRole("link", { name: "Điều khoản sử dụng" })).toBeVisible()
    const sent = page.waitForRequest((request) => request.url().endsWith("/api/auth/signup"))
    await page.getByLabel("Email").fill(`moi-${Date.now()}@kiwii.test`)
    await page.getByLabel("Mật khẩu", { exact: true }).fill("mat-khau-dai")
    await page.getByRole("button", { name: "Đăng ký", exact: true }).click()
    expect((await sent).postDataJSON()).toMatchObject({ ref: "ABCDEFGH" })
  })
})

test.describe("customer", () => {
  test.use({ storageState: PRO_STATE })

  test("the account shows an invitation link to copy", async ({ page }) => {
    await page.goto("/account")
    await expect(page.getByText("Giới thiệu bạn bè")).toBeVisible()
    await expect(page.getByText(/\/\?ref=[A-Z2-9]{8}$/)).toBeVisible()
    await expect(page.getByText("0 người đã đăng ký, 0 người đã mua gói")).toBeVisible()
  })

  test("a signed-in customer reads the policies too", async ({ page }) => {
    await page.goto("/privacy")
    await expect(page.getByRole("heading", { level: 1, name: "Chính sách quyền riêng tư" })).toBeVisible()
    // And goes back to the studio from there, not to a sign-in form.
    await page.getByRole("banner").getByRole("link", { name: "Mở studio" }).click()
    await expect(page).toHaveURL(/:\d+\/$/)
  })
})

test.describe("use-case pages", () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test("a visitor lands on a page for what they came to make, and it leads to the templates", async ({ page }) => {
    await page.goto("/anh-san-pham-ai")
    await expect(page.getByRole("heading", { level: 1, name: "Ảnh sản phẩm bằng AI cho shop online" })).toBeVisible()
    await expect(page).toHaveTitle("Ảnh sản phẩm bằng AI cho shop online · Amberpix")
    await expect(page.getByRole("link", { name: /^Sản phẩm nền trắng/ })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Chai nước hoa hổ phách" })).toBeVisible()
    // The other pages are one tap away, and so is signing up to reach the templates.
    await page
      .getByRole("navigation", { name: "Làm được gì" })
      .first()
      .getByRole("link", { name: /^Video sản phẩm/ })
      .click()
    await expect(page).toHaveURL(/\/video-san-pham-ai$/)
    await expect(page.locator("video")).toHaveCount(3)
    await page.getByRole("link", { name: /^Xoay quanh sản phẩm/ }).click()
    await expect(page).toHaveURL(/\/signup\?next=%2Ftemplates$/)
  })
})
