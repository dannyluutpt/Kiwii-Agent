import { createSignal, For, onMount, Show } from "solid-js"
import { apiUpload } from "@/api"
import { useLanguage } from "@/context/language"
import { errorMessage } from "@/lib/errors"
import { useShortcut } from "@/lib/shortcuts"
import { IconButton } from "@/ui/icon-button"
import { Spinner } from "@/ui/spinner"
import { toast } from "@/ui/toast"
import { IconArrowUp, IconClose, IconDocument, IconPaperclip, IconStop } from "./icons"

export type Attachment = { id: string; name: string; size: number; mime: string }

// What the chat screen can do to the composer from outside: drop files on the page, fill in a
// suggestion, move focus back after an action.
export type ComposerHandle = {
  attach: (files: FileList | File[]) => void
  fill: (text: string) => void
  focus: () => void
}

const MAX_ATTACHMENTS = 5
// Mirrors what the API reads (packages/api/src/chat/attachments.ts): PDFs and text-like files.
const ACCEPT = [
  ".pdf,application/pdf,text/*,application/json",
  ".txt,.md,.markdown,.csv,.tsv,.json,.xml,.yaml,.yml,.html,.htm,.css,.js,.mjs,.ts,.tsx,.jsx,.py,.rb,.go,.rs",
  ".java,.kt,.c,.h,.cpp,.hpp,.cs,.php,.sql,.sh,.bash,.toml,.ini,.env,.log",
].join(",")

export function ChatPromptBar(props: {
  busy: boolean
  disabled?: boolean
  onSend: (text: string, attachments: Attachment[]) => void
  onStop: () => void
  handle?: (handle: ComposerHandle) => void
}) {
  const { t } = useLanguage()
  const [text, setText] = createSignal("")
  const [attachments, setAttachments] = createSignal<Attachment[]>([])
  const [uploading, setUploading] = createSignal(false)
  let ref: HTMLTextAreaElement | undefined
  let fileInput: HTMLInputElement | undefined

  const canSend = () =>
    !props.busy && !props.disabled && !uploading() && (text().trim().length > 0 || attachments().length > 0)

  const submit = () => {
    if (!canSend()) return
    props.onSend(text().trim(), attachments())
    setText("")
    setAttachments([])
    ref?.focus()
  }

  const upload = async (list: FileList | File[]) => {
    const picked = Array.from(list).slice(0, Math.max(0, MAX_ATTACHMENTS - attachments().length))
    if (picked.length === 0) return
    setUploading(true)
    for (const file of picked) {
      const form = new FormData()
      form.append("file", file)
      const stored = await apiUpload<Attachment>("/chat/files", form).catch((error: unknown) => {
        toast.error(errorMessage(error, t("error.generic")))
        return undefined
      })
      if (stored) setAttachments((items) => [...items, stored])
    }
    setUploading(false)
    if (fileInput) fileInput.value = ""
  }

  onMount(() =>
    props.handle?.({
      attach: (files) => void upload(files),
      fill: (value) => {
        setText(value)
        ref?.focus()
        ref?.setSelectionRange(value.length, value.length)
      },
      focus: () => ref?.focus(),
    }),
  )

  // "/" jumps to the composer from anywhere on the screen, as in most chat apps.
  useShortcut({ key: "/" }, () => ref?.focus())

  return (
    <form
      class="flex flex-col rounded-panel bg-surface shadow-floating transition-shadow duration-(--motion-micro) focus-within:shadow-[var(--k-shadow-floating),0_0_0_1.5px_var(--k-focus)]"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Show when={attachments().length > 0}>
        <ul class="flex flex-wrap gap-1.5 px-3 pt-3" aria-label={t("chat.attachments")}>
          <For each={attachments()}>
            {(file) => (
              <li class="flex h-9 max-w-full items-center gap-2 rounded-[10px] bg-fill-2 pr-1 pl-2.5 text-subhead text-label animate-fade-in">
                <IconDocument class="size-4 shrink-0 text-label-2" />
                <span class="max-w-48 truncate">{file.name}</span>
                <IconButton
                  label={`${t("chat.attach.remove")}: ${file.name}`}
                  size="xs"
                  tooltip={false}
                  icon={<IconClose class="size-4" />}
                  onClick={() => setAttachments((items) => items.filter((f) => f.id !== file.id))}
                />
              </li>
            )}
          </For>
        </ul>
      </Show>
      <div class="flex items-end gap-1 p-1.5">
        <input
          ref={fileInput}
          type="file"
          multiple
          accept={ACCEPT}
          class="hidden"
          onChange={(event) => event.currentTarget.files && void upload(event.currentTarget.files)}
        />
        <Show
          when={!uploading()}
          fallback={
            <span class="flex size-10 items-center justify-center text-label-2">
              <Spinner class="size-5" label={t("chat.uploading")} />
            </span>
          }
        >
          <IconButton
            label={t("chat.attach.hint")}
            size="lg"
            icon={<IconPaperclip class="size-[22px]" />}
            disabled={props.disabled || attachments().length >= MAX_ATTACHMENTS}
            onClick={() => fileInput?.click()}
          />
        </Show>
        <textarea
          ref={ref}
          data-component="chat-textarea"
          class="min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-body text-label outline-none placeholder:text-label-3"
          rows={1}
          placeholder={t("chat.placeholder")}
          aria-label={t("chat.placeholder")}
          enterkeyhint="send"
          autocapitalize="sentences"
          value={text()}
          disabled={props.disabled}
          onInput={(event) => setText(event.currentTarget.value)}
          onPaste={(event) => {
            const files = event.clipboardData?.files
            if (!files || files.length === 0) return
            event.preventDefault()
            void upload(files)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
              event.preventDefault()
              submit()
            }
            if (event.key === "Escape" && props.busy) props.onStop()
          }}
        />
        <Show
          when={props.busy}
          fallback={
            <IconButton
              type="submit"
              label={t("chat.send")}
              variant="primary"
              size="lg"
              circle
              icon={<IconArrowUp class="size-5" weight={2.25} />}
              disabled={!canSend()}
            />
          }
        >
          <IconButton
            label={t("chat.stop")}
            keys="Esc"
            variant="filled"
            size="lg"
            circle
            icon={<IconStop class="size-5" />}
            onClick={() => props.onStop()}
          />
        </Show>
      </div>
    </form>
  )
}
