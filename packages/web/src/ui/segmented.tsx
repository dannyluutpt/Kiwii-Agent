import { SegmentedControl } from "@kobalte/core/segmented-control"
import { For, type JSX } from "solid-js"

// iOS-style segmented control: a radio group whose selection thumb slides between options. Arrow
// keys move the selection; the group is labelled for assistive tech even when the label is hidden.
export function Segmented<T extends string>(props: {
  label: string
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; icon?: JSX.Element }>
  block?: boolean
  class?: string
}) {
  return (
    <SegmentedControl
      value={props.value}
      onChange={(value) => props.onChange(value as T)}
      class={`relative rounded-[11px] bg-fill-2 p-[3px] ${props.block ? "flex w-full" : "inline-flex"} ${props.class ?? ""}`}
    >
      <SegmentedControl.Label class="sr-only">{props.label}</SegmentedControl.Label>
      <SegmentedControl.Indicator class="k-segmented-indicator absolute top-[3px] left-[3px] rounded-[8px] bg-surface shadow-raised dark:bg-surface-3" />
      <For each={props.options}>
        {(option) => (
          <SegmentedControl.Item
            value={option.value}
            class="relative z-10 flex-1 rounded-[8px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus"
          >
            <SegmentedControl.ItemInput />
            <SegmentedControl.ItemLabel class="flex h-8 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap px-3 text-subhead font-medium text-label-2 transition-[color,background-color] duration-(--motion-micro) data-[checked]:text-label pointer-coarse:h-9">
              {option.icon}
              {option.label}
            </SegmentedControl.ItemLabel>
          </SegmentedControl.Item>
        )}
      </For>
    </SegmentedControl>
  )
}
