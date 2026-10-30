import { and, eq } from "drizzle-orm"
import { ulid } from "ulid"
import { ApiError } from "../app"
import type { Database } from "../db/client"
import { files, generations } from "../db/schema"
import { cutPanel, grayCopy, SQUEEZED_ROWS, type Gray } from "../images/panels"
import { objectKey, putObject } from "../images/r2"
import { copyPhotos } from "../images/saved"
import { ensureCharacterRoom, insertCharacter } from "./store"

// A character made from a description: one picture with the face on the left and four full-body
// views on the right, cut into the photos the character is saved with. One picture keeps the face,
// the outfit and the build the same in every view, at the price of one picture.
export const CHARACTER_SHEET = { model: "nano-banana-2.1", option: "2K", aspectRatio: "16:9" } as const

export const SheetStyle = ["photo", "3d", "anime"] as const
export type SheetStyle = (typeof SheetStyle)[number]

const LOOKS: Record<SheetStyle, { look: string; finish: string }> = {
  photo: { look: "photorealistic", finish: "Real skin with visible pores, natural colors." },
  "3d": {
    look: "a 3D animated character in the style of a modern animated feature film",
    finish: "Clean stylized materials, soft studio light.",
  },
  anime: { look: "anime style with clean line art and cel shading", finish: "Flat, clean colors." },
}

// The layout the panels are cut along, then the person's screened description of the character.
export function characterSheetPrompt(description: string, style: SheetStyle) {
  return [
    `Character reference sheet of one character, ${LOOKS[style].look}, on a plain light gray studio background with soft, even light.`,
    "Left third: a head-and-shoulders portrait of the character facing the camera with a neutral expression.",
    "Right two thirds: the same character standing, full body, shown four times in a row, evenly spaced and not overlapping: front view, three-quarter view, side profile, back view.",
    `Same face, outfit and proportions in every view. ${LOOKS[style].finish} No text, no labels, no borders.`,
    `The character: ${description}`,
  ].join(" ")
}

// Saves a character from a sheet the account made: the face panel and the front view cut from it,
// then the whole sheet. A run with room for one or two photos of the character then still gets the
// face and the whole figure. Without the Images binding, or when the sheet cannot be read, the
// character keeps the whole sheet alone.
export async function characterFromSheet(
  db: Database,
  bucket: R2Bucket,
  images: ImagesBinding | undefined,
  input: { userID: string; name: string; fileID: string },
) {
  const sheet = await db
    .select({ r2_key: files.r2_key })
    .from(files)
    .innerJoin(generations, eq(generations.id, files.generation_id))
    .where(and(eq(files.id, input.fileID), eq(files.user_id, input.userID), eq(generations.sheet, "character")))
    .get()
  if (!sheet) throw new ApiError(404, "SHEET_NOT_FOUND", "Không tìm thấy bảng nhân vật")
  await ensureCharacterRoom(db, input.userID)
  const object = await bucket.get(sheet.r2_key)
  if (!object) throw new ApiError(404, "FILE_NOT_FOUND", "Không tìm thấy ảnh")
  const bytes = new Uint8Array(await object.arrayBuffer())
  const cuts = images
    ? await cutCharacter(images, bytes).catch((error: unknown) => {
        console.warn(`[sheet] kept the whole sheet, could not cut it: ${String(error)}`)
        return []
      })
    : []
  const cutFiles = cuts.map((cut) => ({
    jpeg: cut.jpeg,
    row: {
      id: ulid(),
      user_id: input.userID,
      r2_key: objectKey(input.userID, "image/jpeg"),
      name: `${cut.name}.jpg`,
      mime: "image/jpeg",
      size: cut.jpeg.byteLength,
      kind: "character" as const,
    },
  }))
  await Promise.all(cutFiles.map((cut) => putObject(bucket, cut.row.r2_key, cut.jpeg, cut.row.mime)))
  if (cutFiles.length) await db.insert(files).values(cutFiles.map((cut) => cut.row))
  const copies = await copyPhotos(db, bucket, { userID: input.userID, fileIDs: [input.fileID], kind: "character" })
  return insertCharacter(db, {
    userID: input.userID,
    name: input.name,
    fileIDs: [...cutFiles.map((cut) => cut.row.id), ...copies],
  })
}

async function cutCharacter(images: ImagesBinding, bytes: Uint8Array) {
  const info = await images.info(new Blob([bytes]).stream())
  if (!("width" in info)) throw new Error("the sheet has no size")
  const gray = await grayCopy(images, bytes, { width: info.width, height: SQUEEZED_ROWS })
  const panels = characterPanels(gray)
  // The copy should be as wide as the sheet; the scale covers one that is not.
  const scale = info.width / gray.width
  const picture = { width: info.width, height: info.height }
  const column = (x: number) => Math.min(info.width, Math.round(x * scale))
  return Promise.all([
    cutPanel(images, bytes, picture, { left: 0, top: 0, width: column(panels.face), height: info.height }).then(
      (jpeg) => ({ name: "face", jpeg }),
    ),
    cutPanel(images, bytes, picture, {
      left: column(panels.front.left),
      top: 0,
      width: column(panels.front.right) - column(panels.front.left),
      height: info.height,
    }).then((jpeg) => ({ name: "front", jpeg })),
  ])
}

// Where a sheet's face panel ends, and the columns of its front view, in columns of `gray`. The face
// panel ends at the edge that runs straight from top to bottom between a fifth and two fifths of the
// width, or at a third when there is none; the figures on the right stand apart on plain background.
export function characterPanels(gray: Gray) {
  const face = panelEdge(gray) ?? Math.round(gray.width / 3)
  const figures = busyRuns(gray, face)
  const first = figures[0] ?? { start: face, end: face + Math.round((gray.width - face) / 4) }
  const left = Math.round((face + first.start) / 2)
  const next = figures[1]
  const right = next ? Math.round((first.end + next.start) / 2) : Math.min(gray.width, first.end + first.start - left)
  return { face, front: { left, right } }
}

// The column where most rows step from one gray to another, between 22% and 42% of the width. A panel
// edge steps in nearly every row; a figure's outline wanders from column to column.
function panelEdge(gray: Gray) {
  const from = Math.round(gray.width * 0.22)
  const to = Math.round(gray.width * 0.42)
  const steps = Array.from({ length: to - from }, (_, index) => {
    const x = from + index
    const rows = Array.from({ length: gray.height }, (_, y) => {
      const at = y * gray.width + x
      return Math.abs((gray.pixels[at] ?? 0) - (gray.pixels[at - 1] ?? 0)) > 3
    })
    return { x, share: rows.filter(Boolean).length / gray.height }
  })
  const best = steps.reduce((top, step) => (step.share > top.share ? step : top), { x: 0, share: 0 })
  return best.share >= 0.5 ? best.x : undefined
}

// Runs of columns right of `from` that vary from top to bottom, each wider than 3% of the width: the
// figures. Plain background barely varies; the threshold rises with the background's own noise.
function busyRuns(gray: Gray, from: number) {
  const spread = Array.from({ length: Math.max(0, gray.width - from) }, (_, index) => {
    const values = Array.from({ length: gray.height }, (_, y) => gray.pixels[y * gray.width + from + index] ?? 0)
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
  })
  const quiet = [...spread].sort((a, b) => a - b)[Math.floor(spread.length * 0.1)] ?? 0
  const threshold = Math.max(6, quiet * 2)
  const runs: Array<{ start: number; end: number }> = []
  const wide = gray.width * 0.03
  let start: number | undefined
  for (const [index, value] of [...spread, 0].entries()) {
    if (value > threshold && start === undefined) start = index
    if (value > threshold || start === undefined) continue
    if (index - start > wide) runs.push({ start: from + start, end: from + index })
    start = undefined
  }
  return runs
}
