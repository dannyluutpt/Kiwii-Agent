import { createSignal, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { Reference } from "@/images"
import { cropSquare, FACE_GUESS, keepInside, MIN_SQUARE, type Square } from "@/lib/crop"
import { Button } from "@/ui/button"

const STEP = 0.02

// Cuts a close-up of the face out of one of a character's photos: drag the square over the face,
// set its size, and the cut goes back as a file. The square moves with the arrow keys too.
export function FaceCrop(props: { photo: Reference; onDone: (file: File) => void; onCancel: () => void }) {
  const { t } = useLanguage()
  const [shape, setShape] = createSignal<{ width: number; height: number }>()
  const [square, setSquare] = createSignal<Square>(FACE_GUESS)
  const [working, setWorking] = createSignal(false)
  let frame: HTMLDivElement | undefined
  let grip: { x: number; y: number; from: Square } | undefined

  const move = (next: Square) => {
    const size = shape()
    if (size) setSquare(keepInside(next, size.width, size.height))
  }
  // The square's box as percentages of the photo.
  const box = () => {
    const size = shape()
    if (!size) return undefined
    const now = square()
    const side = now.size * Math.min(size.width, size.height)
    const width = side / size.width
    const height = side / size.height
    return {
      left: `${(now.x - width / 2) * 100}%`,
      top: `${(now.y - height / 2) * 100}%`,
      width: `${width * 100}%`,
      height: `${height * 100}%`,
    }
  }
  // Everything but the square, to dim the part of the photo that is left out.
  const outside = () => {
    const size = shape()
    if (!size) return undefined
    const now = square()
    const side = now.size * Math.min(size.width, size.height)
    const l = (now.x - side / size.width / 2) * 100
    const r = (now.x + side / size.width / 2) * 100
    const t = (now.y - side / size.height / 2) * 100
    const b = (now.y + side / size.height / 2) * 100
    return `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${l}% ${t}%, ${l}% ${b}%, ${r}% ${b}%, ${r}% ${t}%, ${l}% ${t}%)`
  }

  const cut = async () => {
    setWorking(true)
    const blob = await fetch(props.photo.url)
      .then((res) => (res.ok ? res.blob() : undefined))
      .catch(() => undefined)
    const file = blob && (await cropSquare(blob, square(), "face.jpg"))
    setWorking(false)
    if (file) props.onDone(file)
    else props.onCancel()
  }

  return (
    <div class="flex flex-col gap-3" role="group" aria-label={t("characters.crop.title")}>
      <p class="text-footnote text-label-2">{t("characters.crop.lead")}</p>
      <div class="flex justify-center rounded-[12px] bg-fill p-2">
        <div ref={frame} class="relative touch-none overflow-hidden rounded-[8px] select-none">
          <img
            src={props.photo.url}
            alt=""
            draggable={false}
            class="block max-h-[36vh] w-auto max-w-full"
            onLoad={(event) => {
              const img = event.currentTarget
              const size = { width: img.naturalWidth, height: img.naturalHeight }
              setShape(size)
              setSquare(keepInside(FACE_GUESS, size.width, size.height))
            }}
          />
          <div class="pointer-events-none absolute inset-0 bg-black/60" style={{ "clip-path": outside() }} />
          <Show when={box()}>
            {(style) => (
              <div
                tabindex="0"
                role="slider"
                aria-label={t("characters.crop.frame")}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(square().y * 100)}
                aria-valuetext={`${Math.round(square().x * 100)}%, ${Math.round(square().y * 100)}%`}
                class="absolute cursor-move border-2 border-accent outline-none focus-visible:border-white"
                style={style()}
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId)
                  grip = { x: event.clientX, y: event.clientY, from: square() }
                }}
                onPointerMove={(event) => {
                  const rect = frame?.getBoundingClientRect()
                  if (!grip || !rect || rect.width === 0) return
                  move({
                    ...grip.from,
                    x: grip.from.x + (event.clientX - grip.x) / rect.width,
                    y: grip.from.y + (event.clientY - grip.y) / rect.height,
                  })
                }}
                onPointerUp={() => (grip = undefined)}
                onPointerCancel={() => (grip = undefined)}
                onKeyDown={(event) => {
                  const by: Record<string, [number, number]> = {
                    ArrowLeft: [-STEP, 0],
                    ArrowRight: [STEP, 0],
                    ArrowUp: [0, -STEP],
                    ArrowDown: [0, STEP],
                  }
                  const step = by[event.key]
                  if (!step) return
                  event.preventDefault()
                  move({ ...square(), x: square().x + step[0], y: square().y + step[1] })
                }}
              />
            )}
          </Show>
        </div>
      </div>
      <label class="flex items-center gap-3 text-subhead text-label">
        <span class="shrink-0">{t("characters.crop.size")}</span>
        <input
          type="range"
          min={MIN_SQUARE * 100}
          max={100}
          step={1}
          value={Math.round(square().size * 100)}
          class="min-w-0 flex-1 accent-(--k-accent)"
          onInput={(event) => move({ ...square(), size: Number(event.currentTarget.value) / 100 })}
        />
      </label>
      <div class="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={props.onCancel}>
          {t("common.cancel")}
        </Button>
        <Button variant="tinted" size="sm" disabled={!shape()} loading={working()} onClick={() => void cut()}>
          {t("characters.crop.use")}
        </Button>
      </div>
    </div>
  )
}
