import { For, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import type { I18nKey } from "@/i18n/vi"
import { IconDocument, IconGlobe, IconPencil, IconSparkles } from "./icons"

const SUGGESTIONS: Array<{ icon: () => JSX.Element; title: I18nKey; prompt: I18nKey }> = [
  { icon: () => <IconPencil class="size-5" />, title: "chat.suggest.email.title", prompt: "chat.suggest.email.prompt" },
  { icon: () => <IconSparkles class="size-5" />, title: "chat.suggest.plan.title", prompt: "chat.suggest.plan.prompt" },
  {
    icon: () => <IconGlobe class="size-5" />,
    title: "chat.suggest.translate.title",
    prompt: "chat.suggest.translate.prompt",
  },
  {
    icon: () => <IconDocument class="size-5" />,
    title: "chat.suggest.explain.title",
    prompt: "chat.suggest.explain.prompt",
  },
]

// New-conversation screen: a short welcome and a few starting points. Picking one fills the
// composer rather than sending, so the person can adjust it first.
export function ChatEmpty(props: { onPick: (prompt: string) => void }) {
  const { t } = useLanguage()
  return (
    <div class="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-8 px-4 py-10 md:px-6">
      <div class="flex flex-col items-center gap-3 text-center">
        <img src="/logo.png" alt="" class="size-14 rounded-[16px] shadow-raised" />
        <h2 class="text-title-1 text-label">{t("chat.empty.title")}</h2>
        <p class="max-w-md text-callout text-label-2">{t("chat.empty.lead")}</p>
      </div>
      <ul class="grid gap-2.5 sm:grid-cols-2" aria-label={t("chat.suggest.label")}>
        <For each={SUGGESTIONS}>
          {(item) => (
            <li>
              <button
                type="button"
                class="flex h-full w-full items-start gap-3 rounded-card bg-surface p-3.5 text-left shadow-raised transition-[background-color,transform] duration-(--motion-micro) ease-standard hover:bg-surface-2 active:scale-[0.99]"
                onClick={() => props.onPick(t(item.prompt))}
              >
                <span class="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
                  {item.icon()}
                </span>
                <span class="flex min-w-0 flex-col gap-0.5">
                  <span class="text-subhead font-semibold text-label">{t(item.title)}</span>
                  <span class="line-clamp-2 text-footnote text-label-2">{t(item.prompt)}</span>
                </span>
              </button>
            </li>
          )}
        </For>
      </ul>
    </div>
  )
}
