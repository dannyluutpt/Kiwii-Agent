import { createSignal, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { Button } from "./button"
import { Dialog } from "./dialog"
import { TextField } from "./text-field"

// Promise-based replacements for window.confirm/prompt, rendered by <ConfirmHost/> once at the root.
type ConfirmRequest = {
  kind: "confirm"
  title: string
  description?: string
  confirmLabel?: string
  destructive?: boolean
  resolve: (ok: boolean) => void
}
type TextRequest = {
  kind: "text"
  title: string
  label: string
  value: string
  confirmLabel?: string
  maxLength?: number
  resolve: (value: string | undefined) => void
}

const [request, setRequest] = createSignal<ConfirmRequest | TextRequest>()
const [open, setOpen] = createSignal(false)

export function askConfirm(options: Omit<ConfirmRequest, "kind" | "resolve">) {
  return new Promise<boolean>((resolve) => {
    setRequest({ ...options, kind: "confirm", resolve })
    setOpen(true)
  })
}

export function askText(options: Omit<TextRequest, "kind" | "resolve">) {
  return new Promise<string | undefined>((resolve) => {
    setRequest({ ...options, kind: "text", resolve })
    setOpen(true)
  })
}

export function ConfirmHost() {
  const { t } = useLanguage()
  const [text, setText] = createSignal("")
  let cancelButton: HTMLButtonElement | undefined
  let input: HTMLInputElement | undefined
  const asConfirm = () => {
    const current = request()
    return current?.kind === "confirm" ? current : undefined
  }
  const asText = () => {
    const current = request()
    return current?.kind === "text" ? current : undefined
  }

  // The request stays set after closing so the dialog keeps its text during the exit animation.
  const settle = (accepted: boolean) => {
    const current = request()
    if (!current || !open()) return
    setOpen(false)
    if (current.kind === "confirm") return current.resolve(accepted)
    const value = text().trim()
    current.resolve(accepted && value ? value : undefined)
  }

  return (
    <Show when={request()}>
      {(current) => (
        <Dialog
          open={open()}
          onOpenChange={(next) => !next && settle(false)}
          title={current().title}
          description={asConfirm()?.description}
          onOpenAutoFocus={(event) => {
            event.preventDefault()
            const field = asText()
            if (field) {
              setText(field.value)
              requestAnimationFrame(() => input?.select())
              return input?.focus()
            }
            // Destructive questions start on Cancel so a stray Enter never deletes anything.
            cancelButton?.focus()
          }}
          actions={
            <>
              <Button ref={cancelButton} variant="secondary" onClick={() => settle(false)}>
                {t("common.cancel")}
              </Button>
              <Button
                variant={asConfirm()?.destructive ? "danger" : "primary"}
                type={asText() ? "submit" : "button"}
                form={asText() ? "k-ask-text" : undefined}
                onClick={() => !asText() && settle(true)}
              >
                {current().confirmLabel ?? t("common.ok")}
              </Button>
            </>
          }
        >
          <Show when={asText()}>
            {(field) => (
              <form
                id="k-ask-text"
                class="mt-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  settle(true)
                }}
              >
                <TextField
                  ref={input}
                  label={field().label}
                  hideLabel
                  value={text()}
                  onChange={setText}
                  maxLength={field().maxLength}
                  enterkeyhint="done"
                />
              </form>
            )}
          </Show>
        </Dialog>
      )}
    </Show>
  )
}
