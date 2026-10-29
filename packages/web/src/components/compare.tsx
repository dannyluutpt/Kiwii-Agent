import { createSignal } from "solid-js"
import { useLanguage } from "@/context/language"
import { IconChevronLeft, IconChevronRight } from "./icons"

// The same scene before and after an edit, one over the other, split by a handle the visitor drags
// or moves with the arrow keys. A mouse press jumps the split to the pointer; on touch screens only a
// sideways drag moves it, so swiping up and down still scrolls the page.
export function Compare(props: { before: string; after: string; alt: string; ratio: string; class?: string }) {
  const { t } = useLanguage()
  const [split, setSplit] = createSignal(50)
  let frame: HTMLDivElement | undefined

  const follow = (event: PointerEvent) => {
    const box = frame?.getBoundingClientRect()
    if (!box) return
    setSplit(Math.min(100, Math.max(0, ((event.clientX - box.left) / box.width) * 100)))
  }

  return (
    <div
      ref={frame}
      class={`rim relative cursor-ew-resize touch-pan-y overflow-hidden rounded-card bg-surface shadow-raised select-none ${props.class ?? ""}`}
      style={{ "aspect-ratio": props.ratio }}
      onPointerDown={(event) => {
        frame?.setPointerCapture(event.pointerId)
        if (event.pointerType === "mouse") follow(event)
      }}
      onPointerMove={(event) => {
        if (frame?.hasPointerCapture(event.pointerId)) follow(event)
      }}
    >
      <img
        src={props.after}
        alt={`${props.alt}, ${t("compare.after").toLowerCase()}`}
        loading="lazy"
        decoding="async"
        draggable={false}
        class="absolute inset-0 size-full object-cover"
      />
      <img
        src={props.before}
        alt={`${props.alt}, ${t("compare.before").toLowerCase()}`}
        loading="lazy"
        decoding="async"
        draggable={false}
        class="absolute inset-0 size-full object-cover"
        style={{ "clip-path": `inset(0 ${100 - split()}% 0 0)` }}
      />
      <span class="glass pointer-events-none absolute top-3 left-3 rounded-full px-2.5 py-1 text-caption font-semibold text-label">
        {t("compare.before")}
      </span>
      <span class="pointer-events-none absolute top-3 right-3 rounded-full bg-amber-gloss px-2.5 py-1 text-caption font-semibold text-on-accent shadow-amber">
        {t("compare.after")}
      </span>
      <span
        class="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_14px_rgb(255_214_10/0.9)]"
        style={{ left: `${split()}%` }}
      />
      <div
        role="slider"
        tabIndex={0}
        aria-label={t("compare.label")}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(split())}
        aria-valuetext={t("compare.value", { n: Math.round(split()) })}
        class="absolute top-1/2 flex size-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-amber-gloss text-on-accent shadow-amber"
        style={{ left: `${split()}%` }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 5
          const keys: Record<string, number> = {
            ArrowLeft: split() - step,
            ArrowRight: split() + step,
            Home: 0,
            End: 100,
          }
          const next = keys[event.key]
          if (next === undefined) return
          event.preventDefault()
          setSplit(Math.min(100, Math.max(0, next)))
        }}
      >
        <IconChevronLeft class="-mr-1 size-4" weight={2.5} />
        <IconChevronRight class="-ml-1 size-4" weight={2.5} />
      </div>
    </div>
  )
}
