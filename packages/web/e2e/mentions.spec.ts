import { expect, test, type Page } from "./fixtures"
import { PRO_STATE } from "./global-setup"

// "@" tags in the prompt against the mock OpenRouter, as a paid account with credits.
test.use({ storageState: PRO_STATE })

const prompt = (page: Page) => page.getByRole("textbox", { name: /^Mô tả bức ảnh/ })
const list = (page: Page) => page.getByRole("listbox", { name: "Nhân vật và bối cảnh đã lưu" })
const png = {
  name: "photo.png",
  mimeType: "image/png",
  buffer: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  ),
}

// A character or a location saved through the API from an uploaded photo.
async function save(page: Page, kind: "characters" | "locations", name: string) {
  const photo: { id: string } = await (
    await page.request.post("/api/images/references", { multipart: { file: png } })
  ).json()
  const saved: { id: string } = await (
    await page.request.post(`/api/${kind}`, { data: { name, fileIDs: [photo.id] } })
  ).json()
  return saved.id
}

test("typing @ picks a saved character or location and writes its name in the prompt", async ({ page }, info) => {
  // Desktop and phone share the account, so names are unique to the run.
  const tag = `${info.project.name.slice(0, 1)}${Date.now() % 100_000}`
  const linh = await save(page, "characters", `Linh ${tag}`)
  const cafe = await save(page, "locations", `Quán Đào ${tag}`)
  await page.goto("/")

  await prompt(page).click()
  await prompt(page).pressSequentially(`@linh ${tag}`)
  await expect(list(page).getByRole("option")).toHaveText([`Linh ${tag}Nhân vật`])
  await page.keyboard.press("Enter")
  await expect(list(page)).toBeHidden()
  await expect(prompt(page)).toHaveValue(`Linh ${tag} `)
  await expect(page.getByRole("list", { name: "Đang dùng" })).toContainText(`Linh ${tag}`)

  // Without its marks, a name is found all the same.
  await prompt(page).pressSequentially(`ngồi ở @quan dao ${tag}`)
  await list(page)
    .getByRole("option", { name: new RegExp(`Quán Đào ${tag}`) })
    .click()
  await expect(prompt(page)).toHaveValue(`Linh ${tag} ngồi ở Quán Đào ${tag} `)
  await expect(page.getByRole("list", { name: "Đang dùng" })).toContainText(`Quán Đào ${tag}`)

  // An email, or an @ inside a word, opens nothing.
  await prompt(page).pressSequentially("lan@gmail")
  await expect(list(page)).toBeHidden()
  await prompt(page).fill(`Linh ${tag} ngồi ở Quán Đào ${tag}`)

  const sent = page.waitForRequest(
    (req) =>
      req.method() === "POST" &&
      /\/api\/(images\/generations|projects\/[^/]+\/messages)$/.test(new URL(req.url()).pathname),
  )
  await page.keyboard.press("Enter")
  const body = (await sent).postDataJSON() as { characterIDs: string[]; locationID?: string }
  expect(body.characterIDs).toEqual([linh])
  expect(body.locationID).toBe(cafe)
})
