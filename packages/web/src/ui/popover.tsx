import { Popover as KPopover } from "@kobalte/core/popover"
import type { JSX } from "solid-js"

// Floating panel anchored to its trigger, for options that need more room than a menu row. Kobalte
// closes it on Escape or an outside click and returns focus to the trigger.
export const Popover = KPopover

export function PopoverContent(props: { label: string; children: JSX.Element; class?: string }) {
  let content: HTMLDivElement | undefined
  return (
    <KPopover.Portal>
      <KPopover.Content
        ref={content}
        tabIndex={-1}
        class={`k-popover z-(--z-popover) max-h-[70dvh] w-[min(360px,calc(100vw-24px))] overflow-y-auto rounded-[18px] bg-elevated bg-sheen p-4 shadow-floating outline-none ${props.class ?? ""}`}
        // Focus the panel, not its first control: the first radio is rarely the selected one, and a
        // ring on it would point at the wrong choice. Tab moves into the controls from here.
        onOpenAutoFocus={(event: Event) => {
          event.preventDefault()
          content?.focus()
        }}
      >
        <KPopover.Title class="sr-only">{props.label}</KPopover.Title>
        {props.children}
      </KPopover.Content>
    </KPopover.Portal>
  )
}
