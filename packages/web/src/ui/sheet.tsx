import { Dialog as KDialog } from "@kobalte/core/dialog"
import { Show, type JSX } from "solid-js"

// Edge-attached panel: the navigation drawer slides in from the left, option panels rise from the
// bottom with a grabber. Same focus trap, Escape and scroll lock as Dialog.
export function Sheet(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  side: "left" | "bottom"
  label: string
  children: JSX.Element
  class?: string
}) {
  return (
    <KDialog open={props.open} onOpenChange={props.onOpenChange}>
      <KDialog.Portal>
        <KDialog.Overlay class="k-overlay fixed inset-0 z-(--z-sheet) bg-scrim" />
        <KDialog.Content
          data-side={props.side}
          class={`k-sheet fixed z-(--z-sheet) flex flex-col outline-none ${
            props.side === "left"
              ? "inset-y-0 left-0 w-[min(86vw,320px)] bg-sidebar shadow-overlay"
              : "inset-x-0 bottom-0 max-h-[90dvh] rounded-t-sheet bg-elevated pb-safe shadow-overlay"
          } ${props.class ?? ""}`}
        >
          <KDialog.Title class="sr-only">{props.label}</KDialog.Title>
          <Show when={props.side === "bottom"}>
            <div aria-hidden="true" class="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-fill-3" />
          </Show>
          {props.children}
        </KDialog.Content>
      </KDialog.Portal>
    </KDialog>
  )
}
