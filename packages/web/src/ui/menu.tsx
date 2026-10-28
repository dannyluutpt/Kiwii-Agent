import { DropdownMenu } from "@kobalte/core/dropdown-menu"
import { For, Show, type JSX } from "solid-js"
import { IconCheck } from "@/components/icons"

// Thin styling layer over Kobalte's dropdown menu: keyboard navigation, typeahead, focus return and
// dismissal all come from Kobalte. Rows grow to 44px on touch screens.
// Menus stay modal, like macOS menus: a click outside only dismisses. A non-modal menu also grabs
// focus back on pointer leave while it fades out, stealing it from a dialog opened by one of its items.
export const Menu = DropdownMenu

// No text colour or height here: items pick label or danger, and one line or two, themselves; two
// utilities for one property on an element would leave the winner up to stylesheet order.
const ROW_BASE =
  "flex cursor-default select-none items-center gap-3 rounded-[9px] px-2.5 text-callout outline-none data-[highlighted]:bg-fill-2 data-[disabled]:opacity-40"
const ROW = `${ROW_BASE} h-9 pointer-coarse:h-11`

export function MenuContent(props: { children: JSX.Element; class?: string }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        class={`k-menu z-(--z-popover) min-w-[220px] max-w-[min(360px,calc(100vw-24px))] rounded-[14px] bg-elevated p-1.5 shadow-floating outline-none ${props.class ?? ""}`}
      >
        {props.children}
      </DropdownMenu.Content>
    </DropdownMenu.Portal>
  )
}

export function MenuItem(props: {
  onSelect: () => void
  icon?: JSX.Element
  destructive?: boolean
  disabled?: boolean
  children: JSX.Element
}) {
  return (
    <DropdownMenu.Item
      class={`${ROW} ${props.destructive ? "text-danger" : "text-label"}`}
      onSelect={props.onSelect}
      disabled={props.disabled}
    >
      <Show when={props.icon}>
        <span class="flex size-5 items-center justify-center" classList={{ "text-label-2": !props.destructive }}>
          {props.icon}
        </span>
      </Show>
      <DropdownMenu.ItemLabel class="min-w-0 flex-1 truncate">{props.children}</DropdownMenu.ItemLabel>
    </DropdownMenu.Item>
  )
}

export function MenuSeparator() {
  return <DropdownMenu.Separator class="mx-2.5 my-1.5 border-t border-separator" />
}

export function MenuRadioGroup<T extends string>(props: {
  label: string
  value: T
  onChange: (value: T) => void
  options: Array<{ value: T; label: string; description?: string; icon?: JSX.Element }>
  // Pickers close like any menu choice; settings such as appearance stay open to preview the result.
  closeOnSelect?: boolean
}) {
  return (
    <DropdownMenu.Group>
      <DropdownMenu.GroupLabel class="px-2.5 pb-1 pt-1.5 text-caption font-semibold text-label-2">
        {props.label}
      </DropdownMenu.GroupLabel>
      <DropdownMenu.RadioGroup value={props.value} onChange={props.onChange}>
        <For each={props.options}>
          {(option) => (
            <DropdownMenu.RadioItem
              value={option.value}
              class={`${option.description ? `${ROW_BASE} min-h-11 py-2` : ROW} text-label`}
              closeOnSelect={props.closeOnSelect ?? false}
            >
              <Show when={option.icon}>
                <span class="flex size-5 items-center justify-center text-label-2">{option.icon}</span>
              </Show>
              <span class="flex min-w-0 flex-1 flex-col">
                <DropdownMenu.ItemLabel>{option.label}</DropdownMenu.ItemLabel>
                <Show when={option.description}>
                  <DropdownMenu.ItemDescription class="text-footnote text-label-2">
                    {option.description}
                  </DropdownMenu.ItemDescription>
                </Show>
              </span>
              <DropdownMenu.ItemIndicator class="text-accent">
                <IconCheck class="size-4" weight={2.25} />
              </DropdownMenu.ItemIndicator>
            </DropdownMenu.RadioItem>
          )}
        </For>
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Group>
  )
}
