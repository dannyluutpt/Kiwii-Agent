import { createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { aspectStyle, type Generation, type ImageModel } from "@/images"
import { IconButton } from "@/ui/icon-button"
import { Spinner } from "@/ui/spinner"
import { IconRefresh, IconTrash } from "./icons"

export function GenerationCard(props: {
  generation: Generation
  model?: ImageModel
  onOpen: (index: number) => void
  onReuse: () => void
  onDelete: () => void
}) {
  const { t, locale } = useLanguage()
  const [showEnhanced, setShowEnhanced] = createSignal(false)
  const g = () => props.generation
  const option = () => props.model?.options.find((o) => o.id === g().option)?.label ?? g().option
  const time = () =>
    new Date(g().createdAt).toLocaleString(locale() === "vi" ? "vi-VN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
    })
  const credits = () => (g().status === "running" ? g().creditsReserved : (g().creditsFinal ?? g().creditsReserved))
  const columns = () =>
    g().n === 1 ? "grid-cols-1 max-w-xl" : g().n === 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4"

  return (
    <article class="flex flex-col gap-3 rounded-card bg-surface p-4 shadow-raised">
      <header class="flex items-start justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-1">
          <p class="line-clamp-2 text-callout text-label">{g().prompt}</p>
          <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-label-2">
            <span class="font-medium text-label">{props.model?.name ?? g().model}</span>
            <span>·</span>
            <span>{option()}</span>
            <span>·</span>
            <span>{g().aspectRatio}</span>
            <span>·</span>
            <span>{t("images.cost", { n: credits() })}</span>
            <span>·</span>
            <span>{time()}</span>
            <Show when={g().status === "running"}>
              <span class="flex items-center gap-1 text-label">
                <Spinner class="size-3.5" /> {t("images.status.running")}
              </span>
            </Show>
            <Show when={g().status === "failed"}>
              <span class="text-danger">{g().errorMessage ?? t("images.status.failed")}</span>
            </Show>
            <Show when={(g().refunded ?? 0) > 0}>
              <span>{t("images.refunded", { n: g().refunded ?? 0 })}</span>
            </Show>
          </div>
          <Show when={g().promptEnhanced}>
            <button
              type="button"
              class="w-fit text-footnote text-label-2 underline-offset-2 hover:text-label hover:underline"
              aria-expanded={showEnhanced()}
              onClick={() => setShowEnhanced(!showEnhanced())}
            >
              {t("images.enhancedPrompt")}
            </button>
            <Show when={showEnhanced()}>
              <p class="rounded-[10px] bg-fill px-3 py-2 text-footnote text-label">{g().promptEnhanced}</p>
            </Show>
          </Show>
        </div>
        <div class="flex shrink-0 items-center gap-0.5">
          <IconButton
            label={t("images.reuse")}
            size="sm"
            icon={<IconRefresh class="size-[18px]" />}
            onClick={() => props.onReuse()}
          />
          <Show when={g().status !== "running"}>
            <IconButton
              label={t("images.delete")}
              size="sm"
              icon={<IconTrash class="size-[18px]" />}
              onClick={() => props.onDelete()}
            />
          </Show>
        </div>
      </header>
      <Show when={g().status !== "failed" || g().images.length > 0}>
        <div class={`grid gap-2 ${columns()}`}>
          <For each={Array.from({ length: g().n }, (_, i) => i)}>
            {(index) => {
              const image = () => g().images.find((img) => img.position === index)
              const preview = () => g().previews?.[index]
              return (
                <Show
                  when={image()}
                  fallback={
                    <div
                      class="relative flex w-full items-center justify-center overflow-hidden rounded-[14px] bg-fill"
                      style={aspectStyle(g().aspectRatio)}
                    >
                      <Show
                        when={preview()}
                        fallback={
                          <Show when={g().status === "running"}>
                            <Spinner class="size-6 text-label-3" label={t("images.status.running")} />
                          </Show>
                        }
                      >
                        <img src={preview()} alt="" class="size-full object-cover opacity-80 blur-[1px]" />
                      </Show>
                    </div>
                  }
                >
                  {(img) => (
                    <button
                      type="button"
                      class="group/img relative w-full overflow-hidden rounded-[14px] bg-fill"
                      style={aspectStyle(g().aspectRatio)}
                      aria-label={t("images.open", { n: index + 1, total: g().n })}
                      onClick={() => props.onOpen(index)}
                    >
                      <img
                        src={img().url}
                        alt={(g().promptEnhanced ?? g().prompt).slice(0, 120)}
                        loading="lazy"
                        class="size-full object-cover transition-transform group-hover/img:scale-[1.02]"
                      />
                    </button>
                  )}
                </Show>
              )
            }}
          </For>
        </div>
      </Show>
    </article>
  )
}
