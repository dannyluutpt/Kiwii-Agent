import { Switch as KSwitch } from "@kobalte/core/switch"
import { Show } from "solid-js"

// iOS-style switch as a settings row: label and optional description on the left, the switch on the
// right. The whole row toggles it; Kobalte keeps a real checkbox underneath for forms and keyboards.
export function Switch(props: {
  label: string
  description?: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  class?: string
}) {
  return (
    <KSwitch
      checked={props.checked}
      onChange={props.onChange}
      disabled={props.disabled}
      class={`group/switch flex cursor-pointer items-center justify-between gap-4 data-[disabled]:cursor-default data-[disabled]:opacity-45 ${props.class ?? ""}`}
    >
      <KSwitch.Input />
      <span class="flex min-w-0 flex-col gap-0.5">
        <KSwitch.Label class="text-callout text-label">{props.label}</KSwitch.Label>
        <Show when={props.description}>
          <KSwitch.Description class="text-footnote text-label-2">{props.description}</KSwitch.Description>
        </Show>
      </span>
      <KSwitch.Control class="relative h-[31px] w-[51px] shrink-0 rounded-full bg-fill-3 transition-[background-color] duration-(--motion-standard) ease-standard group-has-[input:focus-visible]/switch:outline-2 group-has-[input:focus-visible]/switch:outline-offset-2 group-has-[input:focus-visible]/switch:outline-focus data-[checked]:bg-accent">
        <KSwitch.Thumb class="absolute top-0.5 left-0.5 size-[27px] rounded-full bg-white shadow-[0_3px_8px_rgb(0_0_0/0.15),0_1px_1px_rgb(0_0_0/0.16)] transition-transform duration-(--motion-standard) ease-spring data-[checked]:translate-x-5" />
      </KSwitch.Control>
    </KSwitch>
  )
}
