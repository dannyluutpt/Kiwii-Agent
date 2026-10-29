import { Dialog as KDialog } from "@kobalte/core/dialog"
import { Show, type JSX } from "solid-js"

// How far (share of the panel) or how fast (px per ms) a drag must go before letting go closes it.
const CLOSE_DISTANCE = 0.3
const CLOSE_SPEED = 0.5
// Movement before a press counts as a drag, so taps and vertical scrolls pass through untouched.
const SLOP = 8

// Edge-attached panel: the navigation drawer slides in from the left, option panels rise from the
// bottom with a grabber. Same focus trap, Escape and scroll lock as Dialog, and like their iOS
// counterparts they follow the finger: drag the drawer left or the sheet's top bar down to close.
export function Sheet(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  side: "left" | "bottom"
  label: string
  children: JSX.Element
  class?: string
}) {
  let panel: HTMLDivElement | undefined
  let drag: { x: number; y: number; at: number; offset: number; speed: number; active: boolean } | undefined
  let releasedAt = -Infinity

  const left = () => props.side === "left"
  // Distance travelled towards the closed position: leftwards for the drawer, downwards for the sheet.
  const toward = (event: PointerEvent) =>
    drag ? (left() ? Math.min(0, event.clientX - drag.x) : Math.max(0, event.clientY - drag.y)) : 0
  const place = (offset: number) => {
    if (!panel) return
    panel.style.transform = offset === 0 ? "" : left() ? `translateX(${offset}px)` : `translateY(${offset}px)`
  }

  const start = (event: PointerEvent) => {
    if (event.pointerType === "mouse" && event.button !== 0) return
    // The sheet drags from its top bar only, so its content can scroll; the drawer drags anywhere.
    if (!left() && !(event.target instanceof Element && event.target.closest("[data-sheet-handle]"))) return
    drag = { x: event.clientX, y: event.clientY, at: event.timeStamp, offset: 0, speed: 0, active: false }
  }

  const move = (event: PointerEvent) => {
    if (!drag || !panel) return
    if (!drag.active) {
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      if (Math.hypot(dx, dy) < SLOP) return
      // A drawer drag has to be mostly sideways; anything else is the list scrolling.
      if (left() && Math.abs(dx) < Math.abs(dy)) {
        drag = undefined
        return
      }
      drag.active = true
      panel.setPointerCapture(event.pointerId)
      panel.style.transition = "none"
    }
    const offset = toward(event)
    const elapsed = Math.max(1, event.timeStamp - drag.at)
    drag.speed = Math.abs(offset - drag.offset) / elapsed
    drag.offset = offset
    drag.at = event.timeStamp
    place(offset)
  }

  const end = (event: PointerEvent) => {
    if (!drag || !panel) return
    const { active, offset, speed } = drag
    drag = undefined
    if (!active) return
    releasedAt = event.timeStamp
    panel.style.transition = ""
    const size = left() ? panel.offsetWidth : panel.offsetHeight
    // Closing animates on from where the finger left it; otherwise the panel springs back.
    if (Math.abs(offset) > size * CLOSE_DISTANCE || speed > CLOSE_SPEED) return props.onOpenChange(false)
    panel.style.transition = "transform var(--motion-standard) var(--ease-spring)"
    place(0)
  }

  return (
    <KDialog open={props.open} onOpenChange={props.onOpenChange}>
      <KDialog.Portal>
        <KDialog.Overlay class="k-overlay fixed inset-0 z-(--z-sheet) bg-scrim" />
        <KDialog.Content
          ref={panel}
          data-side={props.side}
          class={`k-sheet fixed z-(--z-sheet) flex flex-col outline-none ${
            props.side === "left"
              ? "inset-y-0 left-0 w-[min(86vw,320px)] touch-pan-y bg-sidebar shadow-overlay"
              : "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-sheet bg-elevated bg-sheen pb-safe shadow-overlay"
          } ${props.class ?? ""}`}
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          // A drag that ends over a link or button must not also press it.
          onClickCapture={(event: MouseEvent) => {
            if (event.timeStamp - releasedAt > 400) return
            event.preventDefault()
            event.stopPropagation()
          }}
        >
          <KDialog.Title class="sr-only">{props.label}</KDialog.Title>
          <Show when={props.side === "bottom"}>
            <div data-sheet-handle class="flex shrink-0 touch-none justify-center pt-2 pb-1" aria-hidden="true">
              <div class="h-1.5 w-10 rounded-full bg-fill-3" />
            </div>
          </Show>
          {props.children}
        </KDialog.Content>
      </KDialog.Portal>
    </KDialog>
  )
}
