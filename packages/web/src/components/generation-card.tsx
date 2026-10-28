import { createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { altFor, aspectStyle, gridFor, type Generation, type ImageModel } from "@/images"
import { Button } from "@/ui/button"
import { IconButton, iconButtonClass } from "@/ui/icon-button"
import { Menu, MenuContent, MenuItem, MenuSeparator } from "@/ui/menu"
import { Spinner } from "@/ui/spinner"
import { toast } from "@/ui/toast"
import { IconCopy, IconEllipsis, IconImage, IconRefresh, IconTrash } from "./icons"

// One run in the studio feed: the prompt and settings, then its pictures. While a run streams, each
// frame shows a shimmer, then the blurred partial preview, then the final picture sharpening in.
export function GenerationCard(props: {
  generation: Generation
  model?: ImageModel
  onOpen: (index: number) => void
  onReuse: () => void
  onRetry: () => void
  onDelete: () => void
}) {
  const { t, locale } = useLanguage()
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
  const grid = () => gridFor(g().n, g().aspectRatio)
  // Pictures from history are already there; only runs started in this session reveal themselves.
  const fresh = () => g().previews !== undefined
  // Opening goes by the picture's place among the finished ones, which the lightbox steps through.
  const shown = () =>
    g()
      .images.slice()
      .sort((a, b) => a.position - b.position)

  const copyPrompt = () =>
    void navigator.clipboard.writeText(g().prompt).then(
      () => toast.success(t("images.promptCopied")),
      () => toast.error(t("error.generic")),
    )

  return (
    <article
      class="flex flex-col gap-3 rounded-card bg-surface p-3 shadow-raised sm:p-4"
      aria-busy={g().status === "running"}
      aria-label={g().prompt.slice(0, 80)}
    >
      <header class="flex items-start gap-1">
        <div class="flex min-w-0 flex-1 flex-col gap-1 pt-1 pl-1">
          <p class="line-clamp-2 text-callout text-label">{g().prompt}</p>
          <p class="flex flex-wrap items-center gap-x-1.5 text-footnote text-label-2">
            <span class="font-medium text-label">{props.model?.name ?? g().model}</span>
            <span aria-hidden="true">·</span>
            <span>{option()}</span>
            <span aria-hidden="true">·</span>
            <span>{g().aspectRatio}</span>
            <span aria-hidden="true">·</span>
            <span>{t("images.cost", { n: credits() })}</span>
            <span aria-hidden="true">·</span>
            <time datetime={new Date(g().createdAt).toISOString()}>{time()}</time>
          </p>
          <Show when={g().status === "running"}>
            <p class="k-shimmer-text w-fit text-footnote font-medium">{t("images.status.running")}</p>
          </Show>
        </div>
        <IconButton
          label={t("images.reuse")}
          size="md"
          icon={<IconRefresh class="size-[18px]" />}
          onClick={() => props.onReuse()}
        />
        <Menu placement="bottom-end" gutter={4}>
          <Menu.Trigger aria-label={t("images.actions")} class={iconButtonClass("ghost", "md")}>
            <IconEllipsis />
          </Menu.Trigger>
          <MenuContent>
            <MenuItem icon={<IconCopy class="size-[18px]" />} onSelect={copyPrompt}>
              {t("images.copyPrompt")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<IconTrash class="size-[18px]" />}
              destructive
              disabled={g().status === "running"}
              onSelect={() => props.onDelete()}
            >
              {t("images.delete")}
            </MenuItem>
          </MenuContent>
        </Menu>
      </header>

      <Show when={g().status === "failed"}>
        <div class="flex flex-wrap items-center gap-3 rounded-[12px] bg-danger-soft px-3 py-2.5" role="alert">
          <p class="min-w-0 flex-1 text-subhead text-danger">
            {g().errorMessage ?? g().error ?? t("images.status.failed")}
            <Show when={(g().refunded ?? 0) > 0}>
              <span class="text-label-2"> · {t("images.refunded", { n: g().refunded ?? 0 })}</span>
            </Show>
          </p>
          <Button size="sm" variant="secondary" onClick={() => props.onRetry()}>
            {t("common.retry")}
          </Button>
        </div>
      </Show>

      <Show when={g().status !== "failed" || g().images.length > 0}>
        <div class={`grid gap-2 ${grid().class}`} style={grid().style}>
          <For each={Array.from({ length: g().n }, (_, i) => i)}>
            {(position) => {
              const image = () => g().images.find((img) => img.position === position)
              const preview = () => g().previews?.[position]
              const [loaded, setLoaded] = createSignal(false)
              return (
                <div class="relative overflow-hidden rounded-[14px] bg-fill" style={aspectStyle(g().aspectRatio)}>
                  <Show when={!image() || !loaded()}>
                    <Show
                      when={preview()}
                      fallback={
                        <Show
                          when={g().status === "running" || image()}
                          fallback={
                            <span class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-footnote text-label-2">
                              <IconImage class="size-6 text-label-3" />
                              {t("images.missing")}
                            </span>
                          }
                        >
                          <span class="k-skeleton absolute inset-0 flex items-center justify-center">
                            <Spinner class="size-5 text-label-3" label={t("images.status.running")} />
                          </span>
                        </Show>
                      }
                    >
                      <img src={preview()} alt="" class="absolute inset-0 size-full scale-105 object-cover blur-md" />
                    </Show>
                  </Show>
                  <Show when={image()}>
                    {(img) => (
                      <button
                        type="button"
                        class="group/img absolute inset-0 size-full cursor-zoom-in"
                        aria-label={t("images.open", { n: position + 1, total: g().n })}
                        onClick={() => props.onOpen(shown().findIndex((item) => item.id === img().id))}
                      >
                        <img
                          src={img().url}
                          alt={altFor(g())}
                          loading="lazy"
                          decoding="async"
                          onLoad={() => setLoaded(true)}
                          class="size-full object-cover transition-[opacity,transform] duration-(--motion-standard) ease-standard group-hover/img:scale-[1.02]"
                          classList={{ "opacity-0": !loaded(), "animate-reveal": loaded() && fresh() }}
                        />
                      </button>
                    )}
                  </Show>
                </div>
              )
            }}
          </For>
        </div>
      </Show>
    </article>
  )
}
