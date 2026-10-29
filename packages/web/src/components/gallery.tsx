import { A } from "@solidjs/router"
import { For, Show, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import type { I18nKey } from "@/i18n/vi"
import { aspectStyle, type Generation, type ModelsResponse } from "@/images"
import { buttonClass } from "@/ui/button"
import { Skeleton } from "@/ui/skeleton"
import { GenerationTile } from "./generation-tile"
import { IconGlobe, IconImage, IconPencil, IconSparkles } from "./icons"
import { LoadMore } from "./load-more"

const PLACEHOLDER_RATIOS = ["1:1", "3:4", "16:9", "1:1", "9:16", "4:3"]

const SUGGESTIONS: Array<{ icon: () => JSX.Element; title: I18nKey; prompt: I18nKey }> = [
  {
    icon: () => <IconImage class="size-5" />,
    title: "images.suggest.photo.title",
    prompt: "images.suggest.photo.prompt",
  },
  {
    icon: () => <IconSparkles class="size-5" />,
    title: "images.suggest.product.title",
    prompt: "images.suggest.product.prompt",
  },
  {
    icon: () => <IconPencil class="size-5" />,
    title: "images.suggest.illustration.title",
    prompt: "images.suggest.illustration.prompt",
  },
  {
    icon: () => <IconGlobe class="size-5" />,
    title: "images.suggest.poster.title",
    prompt: "images.suggest.poster.prompt",
  },
]

// The runs of one gallery, newest first, as a masonry of tiles. Above them, what the account can
// do (a trial banner, or the upgrade card when it cannot generate); with no runs yet, a few prompts
// to start from.
export function Gallery(props: {
  items: Generation[]
  loading: boolean
  more: boolean
  config: ModelsResponse | undefined
  locked: boolean
  onLoadMore: () => void
  onSuggest: (prompt: string) => void
  onOpen: (g: Generation, index: number) => void
  onReuse: (g: Generation) => void
  onRetry: (g: Generation) => void
  onDelete: (g: Generation) => void
}) {
  const { t } = useLanguage()
  const empty = () => !props.loading && props.items.length === 0

  return (
    <div class="flex min-h-full w-full flex-col gap-4 px-3 py-3 md:px-5 md:py-5">
      <Show when={props.config?.trial}>
        <div class="flex flex-wrap items-center gap-3 rounded-card bg-accent-soft px-4 py-3">
          <p class="min-w-0 flex-1 text-subhead text-label">{t("images.trial", { n: props.config?.credits ?? 0 })}</p>
          <A href="/pricing" class={buttonClass("primary", "sm")}>
            {t("images.locked.cta")}
          </A>
        </div>
      </Show>
      <Show when={props.locked}>
        <div class="flex flex-col items-start gap-2 rounded-card bg-surface p-5 shadow-raised">
          <span class="flex size-10 items-center justify-center rounded-[12px] bg-accent-soft text-accent">
            <IconSparkles class="size-5" />
          </span>
          <h2 class="text-title-3 text-label">{t("images.locked.title")}</h2>
          <p class="text-callout text-label-2">{t("images.locked.lead")}</p>
          <A href="/pricing" class={buttonClass("primary", "md", "mt-2")}>
            {t("images.locked.cta")}
          </A>
        </div>
      </Show>
      <Show when={empty() && !props.locked}>
        <div class="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 py-6">
          <div class="flex flex-col items-center gap-2 text-center">
            <span class="mb-1 flex size-14 items-center justify-center rounded-[16px] bg-accent-soft text-accent shadow-raised">
              <IconImage class="size-7" />
            </span>
            <h2 class="text-title-1 text-label">{t("images.empty.title")}</h2>
            <p class="max-w-md text-callout text-label-2">{t("images.empty.lead")}</p>
          </div>
          <ul class="grid gap-2.5 sm:grid-cols-2" aria-label={t("images.suggest.label")}>
            <For each={SUGGESTIONS}>
              {(item) => (
                <li>
                  <button
                    type="button"
                    class="flex h-full w-full items-start gap-3 rounded-card bg-surface p-3.5 text-left shadow-raised transition-[background-color,transform] duration-(--motion-micro) ease-standard hover:bg-surface-2 active:scale-[0.99]"
                    onClick={() => props.onSuggest(t(item.prompt))}
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
      </Show>
      <Show when={props.items.length > 0 || props.loading}>
        <div class="columns-2 gap-2 md:gap-3 lg:columns-3 2xl:columns-4" aria-label={t("images.gallery")}>
          <For each={props.items}>
            {(g) => (
              <GenerationTile
                generation={g}
                model={props.config?.models.find((m) => m.id === g.model)}
                onOpen={(index) => props.onOpen(g, index)}
                onReuse={() => props.onReuse(g)}
                onRetry={() => props.onRetry(g)}
                onDelete={() => props.onDelete(g)}
              />
            )}
          </For>
          <Show when={props.loading && props.items.length === 0}>
            <For each={PLACEHOLDER_RATIOS}>
              {(ratio) => (
                <div class="mb-2 break-inside-avoid md:mb-3" style={aspectStyle(ratio)} aria-hidden="true">
                  <Skeleton class="size-full rounded-[14px]" />
                </div>
              )}
            </For>
          </Show>
        </div>
      </Show>
      <Show when={props.items.length > 0}>
        <LoadMore more={props.more} loading={props.loading} onLoad={props.onLoadMore} />
      </Show>
    </div>
  )
}
