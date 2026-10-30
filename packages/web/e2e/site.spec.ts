import { expect, test } from "./fixtures"

// The public website a visitor sees before signing in.
test.use({ storageState: { cookies: [], origins: [] } })

test("a visitor lands on the website and can start from there", async ({ page }) => {
  await page.goto("/")
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Ý tưởng thành ảnh đẹp")
  // The pictures on screen load.
  const broken = await page
    .locator("img")
    .evaluateAll((images: HTMLImageElement[]) => images.filter((img) => img.complete && img.naturalWidth === 0).length)
  expect(broken).toBe(0)
  await page
    .getByRole("banner")
    .getByRole("link", { name: /^Dùng thử/ })
    .click()
  await expect(page).toHaveURL(/\/signup$/)
  // The sign-in card leads back to the website.
  await page.getByRole("link", { name: "Amberpix" }).click()
  await expect(page).toHaveURL(/\/$/)
})

test("the before and after slider follows the keys and the pointer", async ({ page, isMobile }) => {
  await page.goto("/")
  const slider = page.getByRole("slider", { name: "Kéo để so sánh ảnh trước và sau khi sửa" }).first()
  await slider.scrollIntoViewIfNeeded()
  await expect(slider).toHaveAttribute("aria-valuenow", "50")
  await slider.focus()
  await page.keyboard.press("ArrowLeft")
  await page.keyboard.press("ArrowLeft")
  await expect(slider).toHaveAttribute("aria-valuenow", "40")
  await page.keyboard.press("End")
  await expect(slider).toHaveAttribute("aria-valuenow", "100")
  test.skip(isMobile, "a tap does not move the split on touch screens; a sideways drag does")
  // A press with the mouse moves the split to the pointer.
  const frame = page.getByRole("img", { name: "Phố cổ Kraków, trước" }).locator("..")
  const box = (await frame.boundingBox())!
  await page.mouse.click(box.x + box.width * 0.25, box.y + box.height / 2)
  await expect(slider).toHaveAttribute("aria-valuenow", "25")
})

test("the sample clips say what each was made from, and one at a time has its sound on", async ({ page }) => {
  await page.goto("/")
  const clips = page.getByRole("list", { name: "Clip mẫu" })
  await clips.scrollIntoViewIfNeeded()
  await expect(clips.locator("video")).toHaveCount(5)
  await expect(clips.getByRole("figure", { name: /^Quầy cà phê Sài Gòn/ })).toContainText(
    "MiniMax H3 · Từ một câu mô tả, có lời thoại",
  )
  // The music under the Tết clip was not the model's; the caption says so.
  await expect(clips.getByRole("figure", { name: /^Bà cháu gói bánh chưng/ })).toContainText("nhạc nền ghép thêm")
  for (const key of ["quay-ca-phe", "quan-pho", "banh-chung", "hoa-dang", "meo-mua"]) {
    expect((await page.request.get(`/showcase/clips/${key}.mp4`)).headers()["content-type"]).toContain("video/mp4")
    expect((await page.request.get(`/showcase/clips/${key}.webp`)).headers()["content-type"]).toContain("image/webp")
  }
  await clips.getByRole("button", { name: "Bật tiếng clip Quầy cà phê Sài Gòn" }).click()
  await expect(clips.getByRole("button", { name: "Tắt tiếng clip Quầy cà phê Sài Gòn" })).toBeVisible()
  // Turning another clip's sound on turns the first one's off.
  await clips.getByRole("button", { name: "Bật tiếng clip Quán phở vỉa hè Hà Nội" }).click()
  await expect(clips.getByRole("button", { name: "Bật tiếng clip Quầy cà phê Sài Gòn" })).toBeVisible()
  await expect(clips.getByRole("button", { name: "Tắt tiếng clip Quán phở vỉa hè Hà Nội" })).toBeVisible()
  const muted = await clips.locator("video").evaluateAll((videos: HTMLVideoElement[]) => videos.map((v) => v.muted))
  expect(muted).toEqual([true, false, true, true, true])
})

test("a sample's prompt carries through signing up to the studio", async ({ page }) => {
  await page.goto("/")
  const use = page.getByRole("link", { name: "Dùng prompt của ảnh Áo dài giữa phố cổ Hội An" })
  const href = (await use.getAttribute("href")) ?? ""
  const next = new URL(href, "https://x").searchParams.get("next") ?? ""
  const studio = new URL(next, "https://x")
  expect(studio.pathname).toBe("/")
  expect(studio.searchParams.get("prompt")).toContain("áo dài lụa vàng")
  expect(studio.searchParams.get("model")).toBe("nano-banana-2.1")
  await use.click()
  await expect(page.getByRole("heading", { name: "Tạo tài khoản Amberpix" })).toBeVisible()
  // Switching to sign in keeps the way back.
  await page.getByRole("link", { name: "Đăng nhập", exact: true }).last().click()
  await expect(page).toHaveURL((url) => url.pathname === "/login" && url.searchParams.get("next") === next)
})

test("prices are public, and choosing a plan asks to sign up first", async ({ page }) => {
  await page.goto("/pricing")
  await expect(page).toHaveURL(/\/pricing$/)
  await expect(page.getByRole("heading", { level: 1, name: "Chọn gói phù hợp" })).toBeVisible()
  await expect(page.getByRole("article", { name: "Plus" })).toContainText("Phổ biến")
  await page.getByRole("article", { name: "Plus" }).getByRole("button", { name: "Chọn gói" }).click()
  await expect(page).toHaveURL(/\/signup\?next=%2Fpricing$/)
})

test("a visitor switches the website to English, and the choice stays", async ({ page }) => {
  await page.goto("/")
  await expect(page.locator("html")).toHaveAttribute("lang", "vi")
  const header = page.getByRole("banner")
  await header.getByRole("button", { name: "Ngôn ngữ: Tiếng Việt" }).click()
  await page.getByRole("menuitemradio", { name: "English" }).click()
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(header.getByRole("link", { name: "Sign in" })).toBeVisible()
  // It is remembered, and the sign-in screen has the picker too.
  await page.reload()
  await expect(header.getByRole("button", { name: "Language: English" })).toBeVisible()
  await header.getByRole("link", { name: "Sign in" }).click()
  await expect(page.getByRole("heading", { name: "Log in to Amberpix" })).toBeVisible()
  await page.getByRole("button", { name: "Language: English" }).click()
  await page.getByRole("menuitemradio", { name: "Tiếng Việt" }).click()
  await expect(page.getByRole("heading", { name: "Đăng nhập Amberpix" })).toBeVisible()
  await expect(page.locator("html")).toHaveAttribute("lang", "vi")
})
