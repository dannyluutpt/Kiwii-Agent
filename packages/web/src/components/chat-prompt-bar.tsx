import { createSignal } from "solid-js"
import { IconButton } from "@kiwii/ui/icon-button"
import { useLanguage } from "@/context/language"

export function ChatPromptBar(props: {
  busy: boolean
  disabled?: boolean
  onSend: (text: string) => void
  onStop: () => void
}) {
  const { t } = useLanguage()
  const [text, setText] = createSignal("")
  let ref: HTMLTextAreaElement | undefined

  const submit = () => {
    const value = text().trim()
    if (!value || props.busy || props.disabled) return
    props.onSend(value)
    setText("")
    ref?.focus()
  }

  return (
    <form
      class="mx-auto flex w-full max-w-3xl items-end gap-2 rounded-2xl border border-border-weak-base bg-surface-raised-base p-2 pl-4 shadow-sm focus-within:border-border-focus"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <textarea
        ref={ref}
        data-component="chat-textarea"
        class="min-h-10 flex-1 resize-none bg-transparent py-2 text-14-regular text-text-strong outline-none placeholder:text-text-weak"
        rows={1}
        placeholder={t("chat.placeholder")}
        value={text()}
        disabled={props.disabled}
        onInput={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault()
            submit()
          }
        }}
      />
      {props.busy ? (
        <IconButton
          icon="stop"
          variant="secondary"
          type="button"
          aria-label={t("chat.stop")}
          onClick={() => props.onStop()}
        />
      ) : (
        <IconButton
          icon="arrow-up"
          variant="primary"
          type="submit"
          aria-label={t("chat.send")}
          disabled={props.disabled || text().trim().length === 0}
        />
      )}
    </form>
  )
}
