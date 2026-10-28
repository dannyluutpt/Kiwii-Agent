import { Dialog as KDialog } from "@kobalte/core/dialog"
import { Show, type JSX } from "solid-js"

// Modal dialog: a card rising from the bottom edge on phones, centred elsewhere. Kobalte traps focus,
// returns it to the trigger on close, closes on Escape and outside clicks, and locks page scroll.
export function Dialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: JSX.Element
  children?: JSX.Element
  actions?: JSX.Element
  onOpenAutoFocus?: (event: Event) => void
}) {
  return (
    <KDialog open={props.open} onOpenChange={props.onOpenChange}>
      <KDialog.Portal>
        <KDialog.Overlay class="k-overlay fixed inset-0 z-(--z-dialog) bg-scrim" />
        <div class="fixed inset-0 z-(--z-dialog) flex items-end justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6">
          <KDialog.Content
            class="k-dialog w-full max-w-[400px] rounded-panel bg-elevated p-5 shadow-overlay outline-none sm:p-6"
            onOpenAutoFocus={props.onOpenAutoFocus}
          >
            <KDialog.Title class="text-title-3 text-label">{props.title}</KDialog.Title>
            <Show when={props.description}>
              <KDialog.Description class="mt-1.5 text-subhead text-label-2">{props.description}</KDialog.Description>
            </Show>
            {props.children}
            <Show when={props.actions}>
              <div class="mt-5 flex gap-2 *:flex-1 sm:justify-end sm:*:flex-none">{props.actions}</div>
            </Show>
          </KDialog.Content>
        </div>
      </KDialog.Portal>
    </KDialog>
  )
}
