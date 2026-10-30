import { expect, test } from "./fixtures"

test.describe("phone", () => {
  test.skip(({ isMobile }) => !isMobile, "phone layout only")

  test("the tab bar moves between the studio, the library and the account", async ({ page }) => {
    await page.goto("/")
    const tabs = page.getByRole("navigation", { name: "Điều hướng chính" })
    await expect(tabs.getByRole("link")).toHaveText(["Studio", "Thư viện", "Tài khoản"])
    await expect(tabs.getByRole("link", { name: "Studio" })).toHaveClass(/text-accent/)
    await tabs.getByRole("link", { name: "Thư viện" }).click()
    await expect(page).toHaveURL(/\/library$/)
    await expect(page.getByRole("heading", { level: 1, name: "Thư viện" })).toBeVisible()
    await tabs.getByRole("link", { name: "Tài khoản" }).click()
    await expect(page.getByRole("heading", { level: 1, name: "Tài khoản" })).toBeVisible()
    // The tab bar covers navigation on phones; no screen offers the drawer.
    await expect(page.getByRole("button", { name: "Mở menu" })).toHaveCount(0)
  })

  // What a phone reads when the site is added to the Home Screen: without a valid manifest iOS keeps
  // the browser bars, and it paints transparent icon areas black.
  test("added to the Home Screen, the site opens as a full-screen app with solid icons", async ({ page }) => {
    await page.goto("/")
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
    expect(JSON.parse(data ?? "{}")).toMatchObject({ display: "standalone", scope: "/", start_url: "/", icons })

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
    await page.goto("/")
    const sidebar = page.getByRole("navigation", { name: "Điều hướng chính" })
    await expect(sidebar.getByRole("link", { name: "Tất cả dự án" })).toBeVisible()
    await expect(page.getByRole("navigation")).toHaveCount(1)

    await sidebar.getByRole("button", { name: "Ẩn thanh bên" }).click()
    await expect(page.getByRole("button", { name: "Hiện thanh bên" })).toBeVisible()
    await page.keyboard.press("ControlOrMeta+Shift+S")
    await expect(page.getByRole("button", { name: "Hiện thanh bên" })).toHaveCount(0)
    await expect(sidebar.getByRole("link", { name: "Tất cả dự án" })).toBeVisible()
  })
})

// There is one dark scheme: a light system setting changes nothing and the account screen offers no choice.
test("the app is always dark", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" })
  await page.goto("/account")
  const html = page.locator("html")
  await expect(html).toHaveCSS("color-scheme", "dark")
  await expect(html).toHaveCSS("background-color", "rgb(10, 10, 10)")
  await expect(page.getByRole("heading", { level: 1 })).toHaveCSS("color", "rgb(245, 245, 244)")
  await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#0a0a0a")
  // On an iPhone Home Screen app the status bar stays black with white text, whatever the phone's setting.
  await expect(page.locator('meta[name="apple-mobile-web-app-status-bar-style"]')).toHaveAttribute("content", "black")
  await expect(page.getByRole("heading", { name: "Cài đặt" })).toBeVisible()
  await expect(page.getByRole("radio", { name: "Tối" })).toHaveCount(0)
})

test("main screens render without script errors", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  for (const path of ["/", "/library", "/pricing", "/account"]) {
    await page.goto(path)
    await expect(page.locator("main#main")).toBeVisible()
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible()
  }
  expect(errors).toEqual([])
})

// The chat is gone and the studio moved to the root; old links, Home Screen icons that start at /chat
// or /images included, still land in the studio, and the old library address in the library.
test("old links open the studio and the library", async ({ page }) => {
  for (const path of ["/chat", "/chat/01ABCDEF", "/images"]) {
    await page.goto(path)
    await expect(page).toHaveURL(/^[^?#]*:\d+\/$/)
  }
  await expect(page.getByRole("main")).not.toContainText(/chat/i)
  await page.goto("/images/assets")
  await expect(page).toHaveURL(/\/library$/)
})
