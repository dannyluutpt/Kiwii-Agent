import { expect, test, type Page } from "./fixtures"
import { PRO_STATE, STATE } from "./global-setup"

// Clips against the mock OpenRouter, as a paid account with credits. A mock video job is done on its
// third look, a few seconds after the run starts with VIDEO_POLL_SECONDS=2 in the local .dev.vars;
// the studio notices on its next ten-second check.
test.use({ storageState: PRO_STATE })

const prompt = (page: Page) => page.getByRole("textbox", { name: /^Mô tả video/ })
const card = (page: Page, text: string) => page.getByRole("article", { name: text }).first()
const makeButton = (page: Page, cost: number) => page.getByRole("button", { name: `Tạo video, ${cost} credit` })
const frames = (page: Page) => page.getByRole("group", { name: "Khung hình của clip" })
const png = (name: string) => ({
  name,
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
})

async function videoMode(page: Page) {
  await page.goto("/")
  await page
    .getByRole("radiogroup", { name: "Tạo ảnh hay video" })
    .locator("label")
    .filter({ hasText: /^Video$/ })
    .click()
  await expect(prompt(page)).toBeVisible()
}

type Setting = "Model" | "Độ phân giải" | "Thời lượng" | "Tỷ lệ"

// On phones every option sits in one bottom sheet; on wide screens each is a chip with a popover.
async function pick(page: Page, isMobile: boolean, setting: Setting, value: string) {
  const panel = isMobile ? page.getByRole("dialog", { name: "Tuỳ chọn" }) : page.getByRole("dialog", { name: setting })
  if (isMobile && !(await panel.isVisible())) await page.getByRole("button", { name: /^Tuỳ chọn:/ }).click()
  if (!isMobile) await page.getByRole("button", { name: new RegExp(`^${setting}:`) }).click()
  await panel
    .locator("label")
    .filter({ hasText: new RegExp(`^${value}`) })
    .first()
    .click()
  if (isMobile) await expect(panel.getByRole("radio", { name: new RegExp(`^${value}`) })).toBeChecked()
}

async function done(page: Page, isMobile: boolean) {
  if (!isMobile) return
  const sheet = page.getByRole("dialog", { name: "Tuỳ chọn" })
  await sheet.getByRole("button", { name: "Xong" }).click()
  await expect(sheet).toBeHidden()
}

test("a clip is made from the composer, plays in the gallery and the viewer, and has a filter of its own", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(60_000)
  await videoMode(page)
  // Wan 3.0 at 720p for 5 seconds unless chosen otherwise: 27 credits.
  await prompt(page).fill("Thuyền giấy trôi trên mặt hồ")
  await makeButton(page, 27).click()
  const tile = card(page, "Thuyền giấy trôi trên mặt hồ")
  await expect(tile).toHaveAttribute("aria-busy", "true")
  await expect(tile.getByText("Đang tạo video…")).toBeVisible()

  const play = tile.getByRole("button", { name: "Xem video" })
  await expect(play).toBeVisible({ timeout: 30_000 })
  await expect(tile).toHaveAttribute("aria-busy", "false")
  await expect(tile.locator("video")).toHaveAttribute("src", /^\/api\/images\/files\/\w+#t=0\.1$/)
  await expect(tile).toContainText("Wan 3.0 · 720p · 16:9 · 5 giây · 27 credit")
  // A clip is no picture to make a character from.
  await tile.getByRole("button", { name: "Thao tác khác" }).click()
  await expect(page.getByRole("menuitem")).toHaveText(["Sao chép prompt", "Cảnh tiếp theo", "Xoá"])
  await page.keyboard.press("Escape")

  await play.click()
  const viewer = page.getByRole("dialog")
  await expect(viewer.locator("video[controls]")).toHaveAttribute("src", /^\/api\/images\/files\/\w+$/)
  await expect(viewer.getByRole("button", { name: "Lưu thành nhân vật" })).toHaveCount(0)
  // iPhones save through the share sheet; elsewhere the clip downloads as a file.
  if (!isMobile) await expect(viewer.getByRole("link", { name: "Tải về" })).toHaveAttribute("href", /\?download$/)
  await viewer.getByRole("button", { name: "Đóng" }).click()
  await expect(viewer).toBeHidden()

  // The Video filter lists clips only, and Ảnh pictures only.
  const filters = page.getByRole("group", { name: "Lọc sản phẩm" })
  await filters.getByRole("button", { name: "Video" }).click()
  await expect(card(page, "Thuyền giấy trôi trên mặt hồ")).toBeVisible()
  await filters.getByRole("button", { name: "Ảnh", exact: true }).click()
  await expect(page.getByRole("article", { name: "Thuyền giấy trôi trên mặt hồ" })).toHaveCount(0)
  await filters.getByRole("button", { name: "Tất cả" }).click()

  // Using it again brings back the clip's words and settings in video mode.
  await prompt(page).fill("")
  await card(page, "Thuyền giấy trôi trên mặt hồ").getByRole("button", { name: "Dùng lại prompt" }).click()
  await expect(prompt(page)).toHaveValue("Thuyền giấy trôi trên mặt hồ")
  await expect(makeButton(page, 27)).toBeEnabled()
})

test("the price follows the model, the resolution, the length and a first frame", async ({ page, isMobile }) => {
  await videoMode(page)
  await prompt(page).fill("Một chiếc lá rơi")
  await pick(page, isMobile, "Độ phân giải", "1080p")
  await pick(page, isMobile, "Thời lượng", "10 giây")
  await done(page, isMobile)
  await expect(makeButton(page, 105)).toBeEnabled()

  await pick(page, isMobile, "Model", "MiniMax H3")
  await done(page, isMobile)
  await expect(makeButton(page, 68)).toBeEnabled()
  // The picture a clip starts from costs nothing more; only one can be added.
  await page.locator('input[data-input="references"]').setInputFiles(png("frame.png"))
  await expect(makeButton(page, 68)).toBeEnabled()
  await expect(page.getByRole("button", { name: /^Thêm ảnh làm khung hình đầu/ })).toBeDisabled()

  await pick(page, isMobile, "Model", "Seedance 2.5")
  await done(page, isMobile)
  await expect(makeButton(page, 122)).toBeEnabled()
})

test("a clip can end on a picture too, at no extra cost, and keeps both frames", async ({ page }) => {
  test.setTimeout(60_000)
  await videoMode(page)
  await prompt(page).fill("Nụ hoa từ từ nở thành bông")
  // The last frame's slot opens once there is a first frame.
  await expect(frames(page)).toHaveCount(0)
  await page.locator('input[data-input="references"]').setInputFiles(png("start.png"))
  await expect(frames(page).getByRole("img", { name: "Khung đầu" })).toBeVisible()
  await expect(frames(page).getByRole("button", { name: "Thêm ảnh làm khung hình cuối" })).toBeVisible()
  await page.locator('input[data-input="last-frame"]').setInputFiles(png("end.png"))
  await expect(frames(page).getByRole("img", { name: "Khung cuối" })).toBeVisible()
  await expect(makeButton(page, 27)).toBeEnabled()

  const sent = page.waitForRequest((req) => req.url().endsWith("/api/videos/generations") && req.method() === "POST")
  await makeButton(page, 27).click()
  const body = (await sent).postDataJSON() as { referenceFileIDs: string[]; lastFrameFileID?: string }
  expect(body.referenceFileIDs).toHaveLength(1)
  expect(body.lastFrameFileID).toEqual(expect.any(String))
  const tile = card(page, "Nụ hoa từ từ nở thành bông")
  await expect(tile.getByRole("button", { name: "Xem video" })).toBeVisible({ timeout: 30_000 })

  // Taking the first frame off takes the last one with it; using the clip again brings both back.
  await frames(page).getByRole("button", { name: "Bỏ khung đầu" }).click()
  await expect(frames(page)).toHaveCount(0)
  await tile.getByRole("button", { name: "Dùng lại prompt" }).click()
  await expect(frames(page).getByRole("img", { name: "Khung đầu" })).toBeVisible()
  await expect(frames(page).getByRole("img", { name: "Khung cuối" })).toBeVisible()
})

test("the next scene starts from a finished clip's last frame, from the gallery or the viewer", async ({ page }) => {
  test.setTimeout(150_000)
  const firstFrame = () => frames(page).getByRole("img", { name: "Khung đầu" })
  const finished = async (text: string) => {
    const tile = card(page, text)
    await expect(tile.getByRole("button", { name: "Xem video" })).toBeVisible({ timeout: 30_000 })
    return tile
  }
  const nextFromMenu = async (tile: ReturnType<typeof card>) => {
    await tile.getByRole("button", { name: "Thao tác khác" }).click()
    await page.getByRole("menuitem", { name: "Cảnh tiếp theo" }).click()
    await expect(firstFrame()).toBeVisible({ timeout: 15_000 })
  }
  const make = async (text: string) => {
    await prompt(page).fill(text)
    const sent = page.waitForRequest((req) => req.url().endsWith("/api/videos/generations") && req.method() === "POST")
    await makeButton(page, 27).click()
    return (await sent).postDataJSON() as { referenceFileIDs: string[] }
  }

  await videoMode(page)
  await make("Con thuyền rời bến lúc bình minh")
  const first = await finished("Con thuyền rời bến lúc bình minh")

  // From picture mode, the next scene comes back to video with the clip's settings and its last
  // frame, a JPEG the size of the clip, as the first frame.
  await page
    .getByRole("radiogroup", { name: "Tạo ảnh hay video" })
    .locator("label")
    .filter({ hasText: /^Ảnh$/ })
    .click()
  await nextFromMenu(first)
  await expect(prompt(page)).toHaveValue("")
  const src = await firstFrame().getAttribute("src")
  const size = await page.evaluate(async (url) => {
    const image = new Image()
    image.src = url ?? ""
    await image.decode()
    return [image.naturalWidth, image.naturalHeight]
  }, src)
  expect(size).toEqual([320, 180])

  // The viewer offers it too.
  await frames(page).getByRole("button", { name: "Bỏ khung đầu" }).click()
  await first.getByRole("button", { name: "Xem video" }).click()
  const viewer = page.getByRole("dialog")
  await viewer.getByRole("button", { name: "Cảnh tiếp theo" }).click()
  await expect(viewer).toBeHidden()
  await expect(firstFrame()).toBeVisible({ timeout: 15_000 })
  expect((await make("Thuyền ra tới giữa sông")).referenceFileIDs).toHaveLength(1)

  // A third clip in a row is fine; continuing a fourth time suggests a fresh picture.
  await nextFromMenu(await finished("Thuyền ra tới giữa sông"))
  await make("Thuyền cập bến bên kia")
  await nextFromMenu(await finished("Thuyền cập bến bên kia"))
  await expect(page.getByText("Bạn đã nối 3 cảnh liền nhau")).toBeVisible()
})

test("a clip the model refuses fails in place and gives its credits back", async ({ page }) => {
  test.setTimeout(60_000)
  await videoMode(page)
  await prompt(page).fill("Một con mèo FAIL nhảy qua hàng rào")
  await makeButton(page, 27).click()
  const tile = card(page, "Một con mèo FAIL nhảy qua hàng rào")
  await expect(tile.getByRole("alert")).toContainText("Nội dung bị model từ chối. Credit đã được hoàn", {
    timeout: 30_000,
  })
  await expect(tile.getByRole("alert")).toContainText("Đã hoàn 27 credit")
  await expect(tile.getByRole("button", { name: "Thử lại" })).toBeVisible()
})

test.describe("free account", () => {
  test.use({ storageState: STATE })

  test("video asks for a paid plan instead of offering a dead composer", async ({ page }) => {
    await videoMode(page)
    await expect(prompt(page)).toBeDisabled()
    await expect(prompt(page)).toHaveAttribute("placeholder", "Tạo video dành cho gói trả phí")
    await expect(page.getByRole("link", { name: "Xem bảng giá" }).last()).toBeVisible()
  })
})
