import { A } from "@solidjs/router"
import { For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useStudio } from "@/context/studio"
import { altFor, aspectStyle, type Generation, type Message, type MessagePart } from "@/images"
import { Spinner } from "@/ui/spinner"

// One turn of the conversation. The person's words sit in a bubble on the right with the pictures
// they attached; the assistant answers on the left with a strip of the runs it started, shimmering
// until each picture lands.
export function AssistantMessage(props: { message: Message; onOpen: (g: Generation, index: number) => void }) {
  const { t } = useLanguage()
  const studio = useStudio()
  const text = () =>
    props.message.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n")
      .trim()
  const attached = () => props.message.parts.flatMap((part) => (part.type === "image" ? [part.fileID] : []))
  const runs = () =>
    props.message.parts.flatMap((part) => {
      const g = part.type === "generation" ? studio.run(part.id) : undefined
      return g ? [g] : []
    })
  const notices = () =>
    props.message.parts.filter((part): part is Extract<MessagePart, { type: "notice" }> => part.type === "notice")

  return (
    <Show
      when={props.message.role === "assistant"}
      fallback={
        <div class="flex flex-col items-end gap-1.5 animate-fade-in">
          <Show when={attached().length > 0}>
            <ul class="flex flex-wrap justify-end gap-1.5" aria-label={t("assistant.attached")}>
              <For each={attached()}>
                {(fileID) => (
                  <li class="rim relative size-14 overflow-hidden rounded-[10px] bg-fill">
                    <img src={`/api/images/files/${fileID}`} alt="" class="size-full object-cover" />
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <p class="max-w-[85%] rounded-[18px] rounded-br-[6px] bg-fill-2 bg-gloss px-3.5 py-2 text-callout whitespace-pre-wrap text-label shadow-gloss">
            {text()}
          </p>
        </div>
      }
    >
      <div class="flex gap-2.5 animate-fade-in" aria-busy={props.message.pending === true}>
        <img
          src="/logo.svg"
          alt=""
          class="mt-0.5 size-6 shrink-0 rounded-[7px] shadow-[0_0_14px_-2px_rgb(255_214_10/0.6)]"
        />
        <div class="flex min-w-0 flex-1 flex-col gap-2.5">
          <Show
            when={text()}
            fallback={
              <Show when={props.message.pending && runs().length === 0}>
                <p class="k-shimmer-text text-callout font-medium">{t("assistant.thinking")}</p>
              </Show>
            }
          >
            <p class="text-callout whitespace-pre-wrap text-label">{text()}</p>
          </Show>
          <For each={runs()}>{(g) => <RunStrip generation={g} onOpen={(index) => props.onOpen(g, index)} />}</For>
          <For each={notices()}>
            {(notice) => (
              <p class="rounded-[12px] bg-warning-soft px-3 py-2 text-footnote text-warning">
                {notice.message}
                <Show when={notice.code === "INSUFFICIENT_CREDITS"}>
                  {" "}
                  <A href="/pricing" class="font-semibold underline">
                    {t("images.topup")}
                  </A>
                </Show>
              </p>
            )}
          </For>
          <Show when={props.message.failed}>
            <p class="text-footnote text-danger" role="alert">
              {props.message.failed}
            </p>
          </Show>
        </div>
      </div>
    </Show>
  )
}

// The pictures of one run, small, in a row: each opens the viewer; a frame still rendering shimmers.
function RunStrip(props: { generation: Generation; onOpen: (index: number) => void }) {
  const { t } = useLanguage()
  const g = () => props.generation
  const shown = () =>
    g()
      .images.slice()
      .sort((a, b) => a.position - b.position)
  const frames = () => Array.from({ length: g().n }, (_, position) => position)
  return (
    <Show
      when={g().status !== "failed" || g().images.length > 0}
      fallback={
        <p class="rounded-[12px] bg-danger-soft px-3 py-2 text-footnote text-danger" role="alert">
          {g().errorMessage ?? g().error ?? t("images.status.failed")}
        </p>
      }
    >
      <ul class="flex flex-wrap gap-1.5" aria-label={g().prompt.slice(0, 80)} aria-busy={g().status === "running"}>
        <For each={frames()}>
          {(position) => {
            const image = () => g().images.find((img) => img.position === position)
            return (
              <li
                class="rim relative h-24 overflow-hidden rounded-[12px] bg-fill shadow-raised"
                style={aspectStyle(g().aspectRatio)}
              >
                <Show
                  when={image()}
                  fallback={
                    <Show when={g().status === "running"}>
                      <span class="k-skeleton absolute inset-0 flex items-center justify-center">
                        <Spinner class="size-4 text-label-3" label="" />
                      </span>
                    </Show>
                  }
                >
                  {(img) => (
                    <button
                      type="button"
                      class="size-full cursor-zoom-in"
                      aria-label={t("images.open", { n: position + 1, total: g().n })}
                      onClick={() => props.onOpen(shown().findIndex((item) => item.id === img().id))}
                    >
                      <img src={img().url} alt={altFor(g())} class="size-full object-cover" />
                    </button>
                  )}
                </Show>
              </li>
            )
          }}
        </For>
      </ul>
    </Show>
  )
}
