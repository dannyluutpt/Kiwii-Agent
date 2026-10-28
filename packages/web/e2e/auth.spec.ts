import { expect, test } from "./fixtures"

// Signed-out screens.
test.use({ storageState: { cookies: [], origins: [] } })

test("a wrong password is explained in place and the email stays", async ({ page }) => {
  await page.goto("/login")
  const email = page.getByLabel("Email")
  await expect(email).toBeFocused()
  await email.fill("khong-ton-tai@kiwii.test")
  const password = page.getByLabel("Mật khẩu", { exact: true })
  await password.fill("sai-mat-khau-123")

  // The eye button shows what was typed and hides it again.
  const reveal = page.getByRole("button", { name: "Hiện mật khẩu" })
  await reveal.click()
  await expect(password).toHaveAttribute("type", "text")
  await page.getByRole("button", { name: "Ẩn mật khẩu" }).click()
  await expect(password).toHaveAttribute("type", "password")

  await page.getByRole("button", { name: "Đăng nhập", exact: true }).click()
  await expect(page.getByRole("alert")).toBeVisible()
  await expect(email).toHaveValue("khong-ton-tai@kiwii.test")
  await expect(page).toHaveURL(/\/login$/)
})

test("the verification code takes digits only and resending waits", async ({ page }) => {
  await page.goto("/signup/verify?email=ban%40vidu.vn")
  await expect(page.getByText("ban@vidu.vn")).toBeVisible()
  const code = page.getByLabel("Mã xác minh")
  await expect(code).toBeFocused()
  await code.pressSequentially("1a2")
  await expect(code).toHaveValue("12")
  await expect(page.getByText(/Gửi lại mã sau \d+ giây/)).toBeVisible()
  await expect(page.getByRole("button", { name: "Gửi lại mã" })).toHaveCount(0)
})

test("a protected screen sends visitors to sign in and back", async ({ page }) => {
  await page.goto("/account")
  await expect(page).toHaveURL(/\/login\?next=%2Faccount$/)
  await expect(page.getByRole("heading", { name: "Đăng nhập Kiwii" })).toBeVisible()
})
