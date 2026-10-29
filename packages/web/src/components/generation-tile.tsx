import { createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { altFor, aspectStyle, type Generation, type ImageModel } from "@/images"
import { Button } from "@/ui/button"
import { IconButton, iconButtonClass } from "@/ui/icon-button"
import { Menu, MenuContent, MenuItem, MenuSeparator } from "@/ui/menu"
import { Spinner } from "@/ui/spinner"
import { toast } from "@/ui/toast"
import { IconCopy, IconEllipsis, IconImage, IconPersonAdd, IconRefresh, IconTrash } from "./icons"

// One run in the gallery: its pictures edge to edge, then a short bar with the prompt and actions.
// A run that is still being prepared or rendered shows a shimmer in each frame, with the blurred
// partial preview once one streams in; the final picture sharpens into place.
export function GenerationTile(props: {
  generation: Generation
  model?: ImageModel
  onOpen: (index: number) => void
  onReuse: () => void
  onRetry: () => void
  onDelete: () => void
  // Opens the dialog that saves a character from the run's pictures.
  onCharacter?: () => void
}) {
  const { t } = useLanguage()
  const g = () => props.generation
  const option = () => props.model?.options.find((o) => o.id === g().option)?.label ?? g().option
  const credits = () => (g().status === "running" ? g().creditsReserved : (g().creditsFinal ?? g().creditsReserved))
  const busy = () => g().status === "running" || g().preparing === true
  // Pictures from history are already there; only runs started in this session reveal themselves.
  const fresh = () => g().previews !== undefined
  const shown = () =>
    g()
      .images.slice()
      .sort((a, b) => a.position - b.position)
  const frames = () =>
    g().status === "failed" && g().images.length === 0 ? [] : Array.from({ length: g().n }, (_, i) => i)

  const copyPrompt = () =>
    void navigator.clipboard.writeText(g().prompt).then(
      () => toast.success(t("images.promptCopied")),
      () => toast.error(t("error.generic")),
    )

  return (
    <article
      class="rim relative mb-2 flex break-inside-avoid flex-col overflow-hidden rounded-[14px] bg-surface bg-sheen shadow-raised transition-[box-shadow,translate,scale] duration-(--motion-standard) ease-standard animate-fade-in hover:-translate-y-0.5 hover:shadow-lift md:mb-3"
      aria-busy={busy()}
      aria-label={g().prompt.slice(0, 80)}
    >
      <div class="grid gap-px" classList={{ "grid-cols-2": g().n > 1 }}>
        <For each={frames()}>
          {(position) => {
            const image = () => g().images.find((img) => img.position === position)
            const preview = () => g().previews?.[position]
            const [loaded, setLoaded] = createSignal(false)
            return (
              <div class="relative overflow-hidden bg-fill" style={aspectStyle(g().aspectRatio)}>
                <Show when={!image() || !loaded()}>
                  <Show
                    when={preview()}
                    fallback={
                      <Show
                        when={busy() || image()}
                        fallback={
                          <span class="absolute inset-0 flex flex-col items-center justify-center gap-1.5 p-3 text-center text-footnote text-label-2">
                            <IconImage class="size-6 text-label-3" />
                            {t("images.missing")}
                          </span>
                        }
                      >
                        <span class="k-skeleton absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
                          <Spinner class="size-5 text-label-3" label="" />
                          <span class="k-shimmer-text text-footnote font-medium">
                            {g().preparing ? t("images.status.preparing") : t("images.status.running")}
                          </span>
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

      <Show when={g().status === "failed"}>
        <div class="flex flex-col gap-2 bg-danger-soft px-3 py-2.5" role="alert">
          <p class="text-footnote text-danger">
            {g().errorMessage ?? g().error ?? t("images.status.failed")}
            <Show when={(g().refunded ?? 0) > 0}>
              <span class="text-label-2"> · {t("images.refunded", { n: g().refunded ?? 0 })}</span>
            </Show>
          </p>
          <Button size="sm" variant="secondary" loading={g().preparing} onClick={() => props.onRetry()}>
            {t("common.retry")}
          </Button>
        </div>
      </Show>

      <div class="flex items-center gap-1 py-1.5 pr-1 pl-3">
        <div class="flex min-w-0 flex-1 flex-col">
          <p class="line-clamp-2 text-footnote text-label" title={g().prompt}>
            {g().prompt}
          </p>
          <p class="truncate text-caption text-label-2">
            {props.model?.name ?? g().model} · {option()} · {g().aspectRatio} · {t("images.cost", { n: credits() })}
          </p>
        </div>
        <IconButton
          label={t("images.reuse")}
          size="sm"
          icon={<IconRefresh class="size-4" />}
          onClick={() => props.onReuse()}
        />
        <Menu placement="bottom-end" gutter={4}>
          <Menu.Trigger aria-label={t("images.actions")} class={iconButtonClass("ghost", "sm")}>
            <IconEllipsis class="size-4" />
          </Menu.Trigger>
          <MenuContent>
            <MenuItem icon={<IconCopy class="size-[18px]" />} onSelect={copyPrompt}>
              {t("images.copyPrompt")}
            </MenuItem>
            <Show when={props.onCharacter && g().images.length > 0}>
              <MenuItem icon={<IconPersonAdd class="size-[18px]" />} onSelect={() => props.onCharacter?.()}>
                {t("characters.saveAs")}
              </MenuItem>
            </Show>
            <MenuSeparator />
            <MenuItem
              icon={<IconTrash class="size-[18px]" />}
              destructive
              disabled={busy() || g().preparing === true}
              onSelect={() => props.onDelete()}
            >
              {t("images.delete")}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </article>
  )
}
