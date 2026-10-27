import { createSignal, Show, type JSX } from "solid-js"
import { Button } from "@kiwii/ui/button"
import { ApiError } from "@/api"
import { useLanguage } from "@/context/language"

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
      class="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (busy()) return
        setBusy(true)
        setError(undefined)
        props
          .onSubmit()
          .catch((err: unknown) => {
            if (err instanceof ApiError) return setError(err.message)
            if (err instanceof TypeError) return setError(t("error.network"))
            setError(t("error.generic"))
          })
          .finally(() => setBusy(false))
      }}
    >
      <div class="flex flex-col gap-1">
        <h1 class="text-20-medium text-text-strong">{props.title}</h1>
        <Show when={props.lead}>
          <p class="text-14-regular text-text-weak">{props.lead}</p>
        </Show>
      </div>
      {props.children}
      <Show when={error()}>
        <p
          class="rounded-md bg-surface-critical-weak px-3 py-2 text-13-regular text-text-on-critical-base"
          role="alert"
        >
          {error()}
        </p>
      </Show>
      <Button variant="primary" size="large" type="submit" disabled={busy()}>
        {props.submit}
      </Button>
      <Show when={props.footer}>
        <div class="text-center text-13-regular text-text-weak">{props.footer}</div>
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
    <label class="flex flex-col gap-1.5">
      <span class="text-13-medium text-text-base">{props.label}</span>
      <input
        class="h-10 rounded-lg border border-border-weak-base bg-surface-inset-base px-3 text-14-regular text-text-strong outline-none focus:border-border-focus"
        type={props.type ?? "text"}
        value={props.value}
        onInput={(event) => props.onInput(event.currentTarget.value)}
        autocomplete={props.autocomplete}
        inputMode={props.inputMode}
        pattern={props.pattern}
        maxLength={props.maxLength}
        autofocus={props.autofocus}
        required
      />
      <Show when={props.hint}>
        <span class="text-12-regular text-text-weak">{props.hint}</span>
      </Show>
    </label>
  )
}
