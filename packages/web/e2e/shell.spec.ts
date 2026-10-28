import { expect, test } from "./fixtures"

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout only")

  test("tab bar navigates and the drawer lists conversations", async ({ page }) => {
    await page.goto("/chat")
    const tabs = page.getByRole("navigation", { name: "Điều hướng chính" })
    await expect(tabs.getByRole("link", { name: "Chat" })).toHaveClass(/text-accent/)
    await tabs.getByRole("link", { name: "Thư viện" }).click()
    await expect(page).toHaveURL(/\/images\/assets$/)
    await expect(page.getByRole("heading", { level: 1, name: "Thư viện" })).toBeVisible()

    await tabs.getByRole("link", { name: "Chat" }).click()
    await page.getByRole("button", { name: "Mở menu" }).click()
    const drawer = page.getByRole("dialog", { name: "Mở menu" })
    await expect(drawer.getByRole("link", { name: "Kế hoạch du lịch Đà Lạt" })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(drawer).toBeHidden()

    await page.getByRole("button", { name: "Mở menu" }).click()
    await drawer.getByRole("link", { name: "Kế hoạch du lịch Đà Lạt" }).click()
    await expect(page).toHaveURL(/\/chat\/e2e-conv-1$/)
    await expect(drawer).toBeHidden()
    await expect(page.getByRole("heading", { level: 1, name: "Kế hoạch du lịch Đà Lạt" })).toBeVisible()
  })

  test("the drawer follows a drag and closes once let go far enough", async ({ page }) => {
    await page.goto("/chat")
    await page.getByRole("button", { name: "Mở menu" }).click()
    const drawer = page.getByRole("dialog", { name: "Mở menu" })
    await expect(drawer).toBeVisible()
    await page.waitForTimeout(400)

    // A short, slow drag springs back and does not open the row it started on.
    await page.mouse.move(240, 420)
    await page.mouse.down()
    for (const x of [234, 228, 222, 216]) {
      await page.mouse.move(x, 420)
      await page.waitForTimeout(40)
    }
    await page.mouse.up()
    await expect(drawer).toBeVisible()
    await expect(page).toHaveURL(/\/chat$/)

    await page.mouse.move(240, 420)
    await page.mouse.down()
    await page.mouse.move(40, 424, { steps: 8 })
    await page.mouse.up()
    await expect(drawer).toBeHidden()
    await expect(page).toHaveURL(/\/chat$/)
  })

  test("screens other than chat leave navigation to the tab bar", async ({ page }) => {
    await page.goto("/account")
    await expect(page.getByRole("heading", { level: 1, name: "Tài khoản" })).toBeVisible()
    await expect(page.getByRole("button", { name: "Mở menu" })).toHaveCount(0)
  })

  // What a phone reads when the site is added to the Home Screen: without a valid manifest iOS keeps
  // the browser bars, and it paints transparent icon areas black.
  test("added to the Home Screen, the site opens as a full-screen app with solid icons", async ({ page }) => {
    await page.goto("/chat")
    const response = await page.request.get("/manifest.webmanifest")
    expect(response.headers()["content-type"]).toContain("application/manifest+json")
    const cdp = await page.context().newCDPSession(page)
    const { url, errors, data } = await cdp.send("Page.getAppManifest")
    expect(url).toMatch(/\/manifest\.webmanifest$/)
    expect(errors).toEqual([])
    const icons = [
      { src: "/icons/icon-192.png", sizes: "192x192" },
      { src: "/icons/icon-512.png", sizes: "512x512" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512" },
    ]
    expect(JSON.parse(data ?? "{}")).toMatchObject({ display: "standalone", scope: "/", start_url: "/chat", icons })

    const measure = (src: string) =>
      page.evaluate(async (src) => {
        const image = new Image()
        image.src = src
        await image.decode()
        const canvas = document.createElement("canvas")
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext("2d")
        if (!context) return { sizes: "", solid: false }
        context.drawImage(image, 0, 0)
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
        // Every fourth byte is a pixel's alpha.
        const solid = pixels.every((value, index) => index % 4 !== 3 || value === 255)
        return { sizes: `${image.naturalWidth}x${image.naturalHeight}`, solid }
      }, src)
    for (const icon of icons) expect(await measure(icon.src)).toEqual({ sizes: icon.sizes, solid: true })
    const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href")
    expect(await measure(touch ?? "")).toEqual({ sizes: "180x180", solid: true })
  })
})

test.describe("desktop", () => {
  test.skip(({ isMobile }) => isMobile, "desktop layout only")

  test("sidebar is docked, collapses and comes back with the shortcut", async ({ page }) => {
    await page.goto("/chat")
    const sidebar = page.getByRole("navigation", { name: "Điều hướng chính" })
    await expect(sidebar.getByRole("link", { name: "Kế hoạch du lịch Đà Lạt" })).toBeVisible()
    await expect(page.getByRole("navigation")).toHaveCount(1)

    await sidebar.getByRole("button", { name: "Ẩn thanh bên" }).click()
    await expect(page.getByRole("button", { name: "Hiện thanh bên" })).toBeVisible()
    await page.keyboard.press("ControlOrMeta+Shift+S")
    await expect(page.getByRole("button", { name: "Hiện thanh bên" })).toHaveCount(0)
    await expect(sidebar.getByRole("link", { name: "Kế hoạch du lịch Đà Lạt" })).toBeVisible()
  })

  test("conversations are renamed and deleted through dialogs", async ({ page }) => {
    await page.goto("/chat")
    const sidebar = page.getByRole("navigation", { name: "Điều hướng chính" })

    await sidebar.getByRole("button", { name: "Tuỳ chọn cho “Viết email xin nghỉ phép”" }).click()
    await page.getByRole("menuitem", { name: "Đổi tên" }).click()
    const rename = page.getByRole("dialog", { name: "Đổi tên hội thoại" })
    await expect(rename.getByRole("textbox")).toBeFocused()
    await rename.getByRole("textbox").fill("Email nghỉ phép thứ Sáu")
    await page.keyboard.press("Enter")
    await expect(rename).toBeHidden()
    await expect(sidebar.getByRole("link", { name: "Email nghỉ phép thứ Sáu" })).toBeVisible()

    await sidebar.getByRole("button", { name: "Tuỳ chọn cho “Email nghỉ phép thứ Sáu”" }).click()
    await page.getByRole("menuitem", { name: "Xoá" }).click()
    const confirm = page.getByRole("dialog", { name: "Xoá hội thoại này?" })
    // Destructive dialogs start on Cancel so Enter alone never deletes.
    await expect(confirm.getByRole("button", { name: "Huỷ" })).toBeFocused()
    await confirm.getByRole("button", { name: "Xoá" }).click()
    await expect(confirm).toBeHidden()
    await expect(sidebar.getByRole("link", { name: "Email nghỉ phép thứ Sáu" })).toHaveCount(0)
  })
})

test("appearance follows the setting and survives a reload", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" })
  await page.goto("/account")
  const html = page.locator("html")
  await expect(html).toHaveAttribute("data-color-scheme", "light")

  await page.getByRole("radio", { name: "Tối" }).click({ force: true })
  await expect(html).toHaveAttribute("data-color-scheme", "dark")
  await page.reload()
  await expect(html).toHaveAttribute("data-color-scheme", "dark")

  await page.getByRole("radio", { name: "Tự động" }).click({ force: true })
  await expect(html).toHaveAttribute("data-color-scheme", "light")
  await page.emulateMedia({ colorScheme: "dark" })
  await expect(html).toHaveAttribute("data-color-scheme", "dark")
})

test("main screens render without script errors", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  for (const path of ["/chat", "/images", "/images/assets", "/pricing", "/account"]) {
    await page.goto(path)
    await expect(page.locator("main#main")).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  }
  expect(errors).toEqual([])
})
