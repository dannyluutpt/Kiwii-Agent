import { TextField as KTextField } from "@kobalte/core/text-field"
import { Show, splitProps, type ComponentProps } from "solid-js"

// 16px text keeps iOS from zooming into the field on focus; 44px height is the touch minimum.
// Height and type size stay out of the base so each variant sets them once.
const INPUT_BASE =
  "w-full rounded-control bg-fill px-3.5 text-label transition-[background-color] duration-(--motion-micro) placeholder:text-label-3 hover:bg-fill-2 focus:bg-surface data-[invalid]:shadow-[inset_0_0_0_1.5px_var(--k-danger)] disabled:opacity-50"
export const inputClass = `${INPUT_BASE} h-11 text-body`
// One-time codes: large spaced digits that read at a glance.
export const codeInputClass = `${INPUT_BASE} h-14 text-center text-title-2 font-semibold tracking-[0.5em] tabular-nums`

// Labelled text input. Kobalte wires label, description and error message to the input for
// assistive tech and marks it invalid when `error` is set.
export function TextField(
  props: Pick<
    ComponentProps<"input">,
    | "ref"
    | "type"
    | "name"
    | "placeholder"
    | "autocomplete"
    | "autocapitalize"
    | "spellcheck"
    | "inputMode"
    | "enterkeyhint"
    | "pattern"
    | "maxLength"
    | "minLength"
    | "autofocus"
    | "required"
    | "disabled"
    | "class"
  > & {
    label?: string
    description?: string
    error?: string
    value: string
    onChange: (value: string) => void
    hideLabel?: boolean
  },
) {
  const [local, rest] = splitProps(props, [
    "label",
    "description",
    "error",
    "value",
    "onChange",
    "hideLabel",
    "class",
    "required",
    "disabled",
  ])
  return (
    <KTextField
      class={`flex flex-col gap-1.5 ${local.class ?? ""}`}
      value={local.value}
      onChange={local.onChange}
      validationState={local.error ? "invalid" : "valid"}
      required={local.required}
      disabled={local.disabled}
    >
      <Show when={local.label}>
        <KTextField.Label class="text-subhead font-medium text-label" classList={{ "sr-only": local.hideLabel }}>
          {local.label}
        </KTextField.Label>
      </Show>
      <KTextField.Input {...rest} class={inputClass} />
      <Show when={local.description && !local.error}>
        <KTextField.Description class="text-footnote text-label-2">{local.description}</KTextField.Description>
      </Show>
      <KTextField.ErrorMessage class="text-footnote text-danger">{local.error}</KTextField.ErrorMessage>
    </KTextField>
  )
}
