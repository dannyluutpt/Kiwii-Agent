import { createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { IconButton } from "@/ui/icon-button"
import { toast } from "@/ui/toast"
import { IconCheck, IconCopy, IconDocument, IconRefresh } from "./icons"
import { Markdown } from "./markdown"

export type Part =
  | { type: "text"; text: string }
  | { type: "file"; file_id: string; name: string; mime: string; size: number }
  | { type: "tool"; name: string }
export type Message = { id: string; role: "user" | "assistant"; parts: Part[]; createdAt: number }
type FilePart = Extract<Part, { type: "file" }>

export function messageText(message: Message) {
  return message.parts
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n\n")
}

// One turn of the conversation. The person's turns are bubbles on the right; Kiwii's answers read
// as full-width text with Copy (and Regenerate on the latest) underneath.
export function MessageView(props: { message: Message; last: boolean; busy: boolean; onRegenerate: () => void }) {
  const { t } = useLanguage()
  const [copied, setCopied] = createSignal(false)
  const text = () => messageText(props.message)
  const files = () => props.message.parts.filter((part): part is FilePart => part.type === "file")

  const copy = () =>
    void navigator.clipboard.writeText(text()).then(
      () => {
        setCopied(true)
        setTimeout(() => setCopied(false), 1600)
      },
      () => toast.error(t("error.generic")),
    )

  return (
    <Show
      when={props.message.role === "assistant"}
      fallback={
        <div
          class="flex flex-col items-end gap-1.5"
          classList={{ "animate-rise-in": props.message.id.startsWith("local-") }}
        >
          <Show when={files().length > 0}>
            <div class="flex max-w-[85%] flex-wrap justify-end gap-1.5">
              <For each={files()}>{(file) => <FileCard file={file} />}</For>
            </div>
          </Show>
          <Show when={text()}>
            <div class="max-w-[85%] rounded-[20px] rounded-br-[6px] bg-surface-2 px-4 py-2.5 text-body whitespace-pre-wrap text-label">
              {text()}
            </div>
          </Show>
        </div>
      }
    >
      <div class="group/message flex flex-col gap-2">
        <Show when={text()}>
          <Markdown text={text()} />
        </Show>
        <Show when={files().length > 0}>
          <div class="flex flex-wrap gap-2">
            <For each={files()}>{(file) => <FileCard file={file} />}</For>
          </div>
        </Show>
        <div
          class="-ml-1.5 flex items-center gap-0.5 transition-opacity duration-(--motion-micro)"
          classList={{
            "pointer-fine:opacity-0 pointer-fine:group-hover/message:opacity-100 pointer-fine:focus-within:opacity-100":
              !props.last,
            invisible: props.busy && props.last,
          }}
        >
          <Show when={text()}>
            <IconButton
              label={copied() ? t("chat.copied") : t("chat.copy")}
              size="sm"
              icon={
                <Show when={copied()} fallback={<IconCopy class="size-[18px]" />}>
                  <IconCheck class="size-[18px] text-success" weight={2.25} />
                </Show>
              }
              onClick={copy}
            />
          </Show>
          <Show when={props.last}>
            <IconButton
              label={t("chat.regenerate")}
              size="sm"
              icon={<IconRefresh class="size-[18px]" />}
              disabled={props.busy}
              onClick={() => props.onRegenerate()}
            />
          </Show>
        </div>
      </div>
    </Show>
  )
}

export function FileCard(props: { file: FilePart }) {
  const { t } = useLanguage()
  const size = () =>
    props.file.size > 1024 * 1024
      ? `${(props.file.size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(props.file.size / 1024))} KB`
  const extension = () => (props.file.name.includes(".") ? props.file.name.split(".").pop()!.toUpperCase() : "")
  return (
    <a
      href={`/api/chat/files/${props.file.file_id}`}
      download={props.file.name}
      class="flex max-w-full items-center gap-3 rounded-card bg-surface py-2.5 pr-4 pl-2.5 shadow-raised transition-[background-color] duration-(--motion-micro) hover:bg-surface-2"
      aria-label={`${props.file.name}, ${size()}, ${t("chat.download")}`}
    >
      <span class="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-accent-soft text-accent">
        <IconDocument class="size-5" />
      </span>
      <span class="flex min-w-0 flex-col">
        <span class="max-w-56 truncate text-subhead font-medium text-label">{props.file.name}</span>
        <span class="text-caption text-label-2">
          {[extension(), size(), t("chat.download")].filter(Boolean).join(" · ")}
        </span>
      </span>
    </a>
  )
}
