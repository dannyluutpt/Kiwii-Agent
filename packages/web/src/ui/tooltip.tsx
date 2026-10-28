import { Tooltip as KTooltip } from "@kobalte/core/tooltip"
import { Show, type JSX } from "solid-js"

export const tooltipContentClass =
  "k-tooltip z-(--z-popover) flex items-center gap-2 rounded-[8px] bg-elevated px-2.5 py-1.5 text-caption font-medium text-label shadow-floating"

// Wraps a focusable element that is not a button (for buttons, IconButton already includes one).
// Kobalte only opens tooltips for mouse hover and keyboard focus, so touch screens never see them.
export function Tooltip(props: {
  label: string
  keys?: string
  placement?: "top" | "bottom" | "left" | "right"
  children: JSX.Element
}) {
  return (
    <KTooltip openDelay={500} closeDelay={0} gutter={6} placement={props.placement ?? "bottom"}>
      <KTooltip.Trigger as="span" class="inline-flex">
        {props.children}
      </KTooltip.Trigger>
      <KTooltip.Portal>
        <KTooltip.Content class={tooltipContentClass}>
          <TooltipText label={props.label} keys={props.keys} />
        </KTooltip.Content>
      </KTooltip.Portal>
    </KTooltip>
  )
}

export function TooltipText(props: { label: string; keys?: string }) {
  return (
    <>
      {props.label}
      <Show when={props.keys}>
        <kbd class="font-sans text-caption text-label-3">{props.keys}</kbd>
      </Show>
    </>
  )
}
