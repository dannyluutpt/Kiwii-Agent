import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { expect, test } from "./fixtures"
import { PRO_STATE } from "./global-setup"

// The webhook key the local Worker expects, from packages/api/.dev.vars.
function sepayKey() {
  const vars = readFileSync(fileURLToPath(new URL("../../api/.dev.vars", import.meta.url)), "utf8")
  const line = vars.split("\n").find((l) => l.startsWith("SEPAY_API_KEY="))
  return (line ?? "").slice("SEPAY_API_KEY=".length).trim()
}

test.describe("paid account", () => {
  test.use({ storageState: PRO_STATE })

  test("a top-up is paid by bank transfer and turns on by itself", async ({ page, context, request }, info) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"])
    await page.goto("/pricing")
    await page.getByRole("button", { name: "Mua 200 credit" }).click()
    await expect(page).toHaveURL(/\/pricing\/checkout\/\w+$/)
    await expect(page.getByText("200 credit · dùng trong 90 ngày")).toBeVisible()
    await expect(page.getByText("229.000 ₫").first()).toBeVisible()
    await expect(page.getByRole("status").filter({ hasText: "Đang chờ chuyển khoản" })).toContainText(/còn \d+ giờ/)

    await page.getByRole("button", { name: "Sao chép nội dung chuyển khoản" }).click()
    const memo = await page.evaluate(() => navigator.clipboard.readText())
    expect(memo).toMatch(/^KW[A-Z0-9]+$/)

    // SePay reports the incoming transfer; the open checkout notices on its next poll.
    const paid = await request.post("/api/billing/webhook/sepay", {
      headers: { authorization: `Apikey ${sepayKey()}` },
      data: {
        id: Date.now() + info.workerIndex,
        transferType: "in",
        transferAmount: 229_000,
        content: `${memo} E2E`,
      },
    })
    expect(paid.ok()).toBe(true)
    await expect(page.getByRole("heading", { name: "Đã cộng 200 credit" })).toBeVisible({ timeout: 10_000 })
    await page.getByRole("link", { name: "Tạo ảnh" }).click()
    await expect(page).toHaveURL(/\/images$/)
  })
})

test.describe("free account", () => {
  test("plans offer image credits only, the free one a trial of FLUX", async ({ page }) => {
    await page.goto("/pricing")
    await expect(page.getByRole("article", { name: "Plus" })).toContainText("750 credit tạo ảnh mỗi tháng")
    await expect(page.getByRole("article", { name: "Miễn phí" })).toContainText(
      "10 credit dùng thử FLUX 3 Klein trong 14 ngày",
    )
    // Chat is gone, and the model behind the prompt rewriting never shows.
    await expect(page.getByRole("main")).not.toContainText(/chat|MiMo/i)
  })

  test("a pending order waits in Account and picks up where it left off", async ({ page }) => {
    await page.goto("/pricing")
    await expect(page.getByText("Cần một gói trả phí đang hoạt động để mua thêm credit.")).toBeVisible()
    await page.getByRole("article", { name: "Starter" }).getByRole("button", { name: "Chọn gói" }).click()
    await expect(page).toHaveURL(/\/pricing\/checkout\/\w+$/)
    const checkout = page.url()

    await page.goto("/account")
    const order = page.getByRole("link", { name: /Gói Starter · 30 ngày/ })
    await expect(order).toContainText("Chờ thanh toán")
    await order.click()
    await expect(page).toHaveURL(checkout)
    await expect(page.getByText("299.000 ₫").first()).toBeVisible()
  })

  test("an expired order offers a fresh one", async ({ page }) => {
    await page.goto("/pricing/checkout/e2e-order-expired")
    await expect(page.getByRole("heading", { name: "Đơn đã hết hạn" })).toBeVisible()
    await page.getByRole("button", { name: "Tạo đơn mới" }).click()
    await expect(page).toHaveURL(/\/pricing\/checkout\/(?!e2e-order-expired)\w+$/)
    await expect(page.getByRole("status").filter({ hasText: "Đang chờ chuyển khoản" })).toBeVisible()
  })

  test("the password button waits until both fields are filled", async ({ page }) => {
    await page.goto("/account")
    const change = page.getByRole("button", { name: "Đổi mật khẩu" })
    await expect(change).toBeDisabled()
    await page.getByLabel("Mật khẩu hiện tại").fill("mat-khau-cu")
    await page.getByLabel("Mật khẩu mới").fill("ngan")
    await expect(change).toBeDisabled()
    await page.getByLabel("Mật khẩu mới").fill("mat-khau-moi-du-dai")
    await expect(change).toBeEnabled()
  })
})
