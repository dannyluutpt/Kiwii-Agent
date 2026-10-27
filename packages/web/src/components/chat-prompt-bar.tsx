import { createSignal, For, Show } from "solid-js"
import { IconButton } from "@kiwii/ui/icon-button"
import { Spinner } from "@kiwii/ui/spinner"
import { showToast } from "@kiwii/ui/toast"
import { Tooltip } from "@kiwii/ui/tooltip"
import { ApiError, apiUpload } from "@/api"
import { useLanguage } from "@/context/language"

export type Attachment = { id: string; name: string; size: number; mime: string }

const MAX_ATTACHMENTS = 5

export function ChatPromptBar(props: {
  busy: boolean
  disabled?: boolean
  onSend: (text: string, attachments: Attachment[]) => void
  onStop: () => void
}) {
  const { t } = useLanguage()
  const [text, setText] = createSignal("")
  const [attachments, setAttachments] = createSignal<Attachment[]>([])
  const [uploading, setUploading] = createSignal(false)
  let ref: HTMLTextAreaElement | undefined
  let fileInput: HTMLInputElement | undefined

  const submit = () => {
    const value = text().trim()
    if ((!value && attachments().length === 0) || props.busy || props.disabled || uploading()) return
    props.onSend(value, attachments())
    setText("")
    setAttachments([])
    ref?.focus()
  }

  const upload = async (list: FileList | null) => {
    if (!list?.length) return
    const picked = Array.from(list).slice(0, Math.max(0, MAX_ATTACHMENTS - attachments().length))
    if (picked.length === 0) return
    setUploading(true)
    try {
      for (const file of picked) {
        const form = new FormData()
        form.append("file", file)
        const stored = await apiUpload<Attachment>("/chat/files", form)
        setAttachments((list) => [...list, stored])
      }
    } catch (error) {
      showToast({ title: error instanceof ApiError ? error.message : t("error.generic"), variant: "error" })
    } finally {
      setUploading(false)
      if (fileInput) fileInput.value = ""
    }
  }

  return (
    <form
      class="mx-auto flex w-full max-w-3xl flex-col gap-1 rounded-2xl border border-border-weak-base bg-surface-raised-base p-2 pl-3 shadow-sm focus-within:border-border-focus"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Show when={attachments().length > 0}>
        <div class="flex flex-wrap gap-1.5 px-1 pt-1">
          <For each={attachments()}>
            {(file) => (
              <span class="flex items-center gap-1 rounded-md border border-border-weak-base bg-surface-base px-2 py-1 text-12-regular text-text-base">
                <span class="max-w-48 truncate">{file.name}</span>
                <button
                  type="button"
                  class="text-text-weak hover:text-text-strong"
                  aria-label={t("chat.attach.remove")}
                  onClick={() => setAttachments((list) => list.filter((f) => f.id !== file.id))}
                >
                  ×
                </button>
              </span>
            )}
          </For>
        </div>
      </Show>
      <div class="flex items-end gap-1">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept=".txt,.md,.csv,.tsv,.json,.xml,.yaml,.yml,.html,.css,.js,.ts,.tsx,.jsx,.py,.rb,.go,.rs,.java,.c,.h,.cpp,.cs,.php,.sql,.sh,.toml,.log,text/*"
          class="hidden"
          onChange={(event) => void upload(event.currentTarget.files)}
        />
        <Tooltip value={t("chat.attach.hint")}>
          <Show when={!uploading()} fallback={<Spinner class="m-2 size-4" />}>
            <IconButton
              icon="plus"
              variant="ghost"
              type="button"
              aria-label={t("chat.attach")}
              disabled={props.disabled || attachments().length >= MAX_ATTACHMENTS}
              onClick={() => fileInput?.click()}
            />
          </Show>
        </Tooltip>
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
            disabled={props.disabled || uploading() || (text().trim().length === 0 && attachments().length === 0)}
          />
        )}
      </div>
    </form>
  )
}
