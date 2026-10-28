import { TextField as KTextField } from "@kobalte/core/text-field"
import { createSignal, Show, type JSX } from "solid-js"
import { ApiError } from "@/api"
import { useLanguage } from "@/context/language"
import { Button } from "@/ui/button"
import { inputClass } from "@/ui/text-field"

// Shared skeleton for the auth screens: title, fields, one submit button, inline error.
export function AuthForm(props: {
  title: string
  lead?: string
  submit: string
  onSubmit: () => Promise<void>
  children: JSX.Element
  footer?: JSX.Element
}) {
  const { t } = useLanguage()
  const [error, setError] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)

  return (
    <form
      class="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy()) return
        setBusy(true)
        setError(undefined)
        props
          .onSubmit()
          .catch((err: unknown) => {
            const network = err instanceof TypeError ? t("error.network") : t("error.generic")
            setError(err instanceof ApiError ? err.message : network)
          })
          .finally(() => setBusy(false))
      }}
    >
      <div class="flex flex-col gap-1.5">
        <h1 class="text-title-2 text-label">{props.title}</h1>
        <Show when={props.lead}>
          <p class="text-subhead text-label-2">{props.lead}</p>
        </Show>
      </div>
      {props.children}
      <Show when={error()}>
        <p class="rounded-[12px] bg-danger-soft px-3.5 py-2.5 text-subhead text-danger" role="alert">
          {error()}
        </p>
      </Show>
      <Button variant="primary" size="lg" type="submit" block loading={busy()}>
        {props.submit}
      </Button>
      <Show when={props.footer}>
        <div class="text-center text-subhead text-label-2">{props.footer}</div>
      </Show>
    </form>
  )
}

export function Field(props: {
  label: string
  type?: string
  value: string
  onInput: (value: string) => void
  autocomplete?: string
  hint?: string
  inputMode?: "numeric" | "email" | "text"
  pattern?: string
  maxLength?: number
  autofocus?: boolean
}) {
  return (
    <KTextField class="flex flex-col gap-1.5" value={props.value} onChange={props.onInput} required>
      <KTextField.Label class="text-subhead font-medium text-label">{props.label}</KTextField.Label>
      <KTextField.Input
        class={inputClass}
        type={props.type ?? "text"}
        autocomplete={props.autocomplete}
        inputMode={props.inputMode}
        pattern={props.pattern}
        maxLength={props.maxLength}
        autofocus={props.autofocus}
        autocapitalize={props.type === "email" ? "off" : undefined}
        spellcheck={props.type === "email" ? false : undefined}
      />
      <Show when={props.hint}>
        <KTextField.Description class="text-footnote text-label-2">{props.hint}</KTextField.Description>
      </Show>
    </KTextField>
  )
}
