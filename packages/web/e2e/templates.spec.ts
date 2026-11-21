import { expect, test } from "./fixtures"
import { PRO_STATE } from "./global-setup"

test.use({ storageState: PRO_STATE })

test("a template asks for a few words and opens the studio with the prompt, the model and the frame set", async ({
  page,
  isMobile,
}) => {
  await page.goto("/templates")
  await expect(page.getByRole("heading", { name: "Mẫu", level: 1 })).toBeVisible()
  await page.getByRole("button", { name: /^Poster khuyến mãi/ }).click()
  const form = page.getByRole("dialog", { name: "Poster khuyến mãi" })
  const use = form.getByRole("button", { name: "Dùng mẫu này" })
  // The headline is required; the small print is not.
  await form.getByLabel("Sản phẩm").fill("trà sữa trân châu")
  await expect(use).toBeDisabled()
  await form.getByLabel("Dòng chữ chính").fill("MUA 1 TẶNG 1")
  await form.getByRole("button", { name: "Sang trọng" }).click()
  await use.click()

  await expect(page).toHaveURL(/:\d+\/$/)
  const prompt = page.getByRole("textbox", { name: /^Mô tả bức ảnh/ })
  await expect(prompt).toHaveValue(/trà sữa trân châu/)
  await expect(prompt).toHaveValue(/"MUA 1 TẶNG 1"/)
  await expect(prompt).toHaveValue(/Phong cách sang trọng/)
  await expect(prompt).not.toHaveValue(/dòng chữ nhỏ hơn/)
  // The poster's own model and frame, whatever was picked before.
  const options = isMobile ? page.getByRole("button", { name: /^Tuỳ chọn:/ }) : page.getByRole("main")
  await expect(isMobile ? options : page.getByRole("button", { name: /^Model:/ })).toContainText("GPT Image")
  await expect(isMobile ? options : page.getByRole("button", { name: /^Tỷ lệ:/ })).toContainText("3:4")
})

test("a clip template switches the composer to video", async ({ page }) => {
  await page.goto("/templates")
  await page.getByRole("button", { name: /^Món ăn nóng hổi/ }).click()
  const form = page.getByRole("dialog", { name: "Món ăn nóng hổi" })
  await form.getByLabel("Món ăn").fill("nồi lẩu thái")
  await form.getByRole("button", { name: "Đẩy vào" }).click()
  await form.getByRole("button", { name: "Dùng mẫu này" }).click()
  await expect(page.getByRole("textbox", { name: /^Mô tả/ })).toHaveValue(/nồi lẩu thái.*Máy quay đẩy chậm thẳng vào/s)
})
