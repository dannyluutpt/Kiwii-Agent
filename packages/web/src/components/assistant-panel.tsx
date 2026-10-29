import { createEffect, For, on, Show } from "solid-js"
import { useAssistant } from "@/context/assistant"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { useStudio } from "@/context/studio"
import type { I18nKey } from "@/i18n/vi"
import type { Generation } from "@/images"
import { Skeleton } from "@/ui/skeleton"
import { AssistantComposer } from "./assistant-composer"
import { AssistantMessage } from "./assistant-message"
import { IconSparkles } from "./icons"

const SUGGESTIONS: I18nKey[] = ["assistant.suggest.poster", "assistant.suggest.variants", "assistant.suggest.edit"]
const VIDEO_SUGGESTIONS: I18nKey[] = ["video.suggest.waves", "video.suggest.coffee", "video.suggest.lanterns"]

// The right column of the workspace: the project's conversation with the image assistant above
// its composer. In "all", the first message opens a project of its own. In video mode the composer
// makes the clip straight from the words (`onMakeVideo`); the assistant makes pictures only.
export function AssistantPanel(props: {
  projectID: string | undefined
  onOpen: (g: Generation, index: number) => void
  onMakeVideo: () => void
}) {
  const { t } = useLanguage()
  const auth = useAuth()
  const studio = useStudio()
  const assistant = useAssistant()
  let log: HTMLDivElement | undefined
  const thread = () => assistant.thread(props.projectID)
  const messages = () => thread()?.messages ?? []
  const clip = () => studio.mode() === "video"

  createEffect(
    on(
      () => props.projectID,
      (id) => {
        if (id) void assistant.load(id)
      },
    ),
  )

  // Follows the reply as it is written, unless the person has scrolled up to read.
  createEffect(
    on(
      () => {
        const last = messages().at(-1)
        return [messages().length, last?.parts.length, JSON.stringify(last?.parts[0] ?? "").length]
      },
      () => {
        if (!log) return
        const near = log.scrollHeight - log.scrollTop - log.clientHeight < 160
        if (near) requestAnimationFrame(() => log?.scrollTo({ top: log.scrollHeight, behavior: "smooth" }))
      },
    ),
  )

  return (
    <section
      class="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel"
      aria-label={t("assistant.title")}
    >
      <div class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-separator px-4">
        <h2 class="flex items-center gap-2 text-headline text-label">
          <IconSparkles class="size-[18px] text-accent" />
          {t("assistant.title")}
        </h2>
        <Show when={auth.me()}>
          {(me) => (
            <span class="rounded-full bg-accent-soft bg-amber-soft-gloss px-2.5 py-1 text-caption font-semibold text-accent tabular-nums shadow-tinted">
              {t("plan.credits", { credits: me().credits.toLocaleString("vi-VN") })}
            </span>
          )}
        </Show>
      </div>
      <div
        ref={log}
        role="log"
        aria-label={t("assistant.log")}
        class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-4 py-4"
      >
        <Show when={messages().length === 0 && !thread()?.loading}>
          <div class="my-auto flex flex-col items-center gap-3 px-2 text-center">
            <span class="flex size-12 items-center justify-center rounded-[14px] bg-amber-gloss text-on-accent shadow-amber">
              <IconSparkles class="size-6" />
            </span>
            <h3 class="text-title-3 text-label">{t("assistant.greeting")}</h3>
            <p class="text-footnote text-label-2">{clip() ? t("video.lead") : t("assistant.lead")}</p>
            <ul class="mt-1 flex flex-col items-stretch gap-2 self-stretch" aria-label={t("images.suggest.label")}>
              <For each={clip() ? VIDEO_SUGGESTIONS : SUGGESTIONS}>
                {(key) => (
                  <li>
                    <button
                      type="button"
                      class="w-full rounded-[14px] bg-fill bg-gloss px-3.5 py-2.5 text-left text-subhead text-label shadow-gloss transition-[background-color,box-shadow] duration-(--motion-micro) hover:bg-gloss-hover hover:shadow-lift"
                      onClick={() => {
                        studio.setPrompt(t(key))
                        document.querySelector<HTMLTextAreaElement>("[data-studio-prompt]")?.focus()
                      }}
                    >
                      {t(key)}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
        <Show when={thread()?.loading && messages().length === 0}>
          <div class="flex flex-col gap-4" aria-hidden="true">
            <Skeleton class="ml-auto h-10 w-3/5 rounded-[18px]" />
            <Skeleton class="h-16 w-4/5 rounded-[14px]" />
          </div>
        </Show>
        <For each={messages()}>{(message) => <AssistantMessage message={message} onOpen={props.onOpen} />}</For>
      </div>
      <Show
        when={studio.config.latest}
        fallback={<Skeleton class="mx-3 mb-3 h-[112px] shrink-0 rounded-[20px]" aria-hidden="true" />}
      >
        {(cfg) => (
          <AssistantComposer
            config={cfg()}
            busy={thread()?.sending === true}
            locked={studio.locked()}
            onSend={() => void assistant.send(props.projectID)}
            onMakeVideo={props.onMakeVideo}
          />
        )}
      </Show>
    </section>
  )
}
