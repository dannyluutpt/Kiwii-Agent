import { createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { altFor, aspectStyle, type Generation } from "@/images"
import { Button } from "@/ui/button"
import { IconButton, iconButtonClass } from "@/ui/icon-button"
import { Menu, MenuContent, MenuItem, MenuSeparator } from "@/ui/menu"
import { Spinner } from "@/ui/spinner"
import { toast } from "@/ui/toast"
import { IconCopy, IconEllipsis, IconImage, IconPersonAdd, IconPlay, IconRefresh, IconTrash, IconVideo } from "./icons"

// One run in the gallery: its pictures edge to edge, then a short bar with the prompt and actions.
// A run that is still being prepared or rendered shows a shimmer in each frame, with the blurred
// partial preview once one streams in; the final picture sharpens into place. A clip shows its
// first frame and plays, muted, while the pointer rests on it.
export function GenerationTile(props: {
  generation: Generation
  // The image or video model the run used, for its name and the option's label.
  model?: { name: string; options: Array<{ id: string; label: string }> }
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
  const clip = () => g().kind === "video"
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
                            <Show when={clip()} fallback={<IconImage class="size-6 text-label-3" />}>
                              <IconVideo class="size-6 text-label-3" />
                            </Show>
                            {clip() ? t("video.missing") : t("images.missing")}
                          </span>
                        }
                      >
                        <span class="k-skeleton absolute inset-0 flex flex-col items-center justify-center gap-2 p-3 text-center">
                          <Spinner class="size-5 text-label-3" label="" />
                          <span class="k-shimmer-text text-footnote font-medium">
                            {g().preparing
                              ? t("images.status.preparing")
                              : clip()
                                ? t("video.status.running")
                                : t("images.status.running")}
                          </span>
                          <Show when={clip() && !g().preparing && !image()}>
                            <span class="text-caption text-label-3">{t("video.status.wait")}</span>
                          </Show>
                        </span>
                      </Show>
                    }
                  >
                    <img src={preview()} alt="" class="absolute inset-0 size-full scale-105 object-cover blur-md" />
                  </Show>
                </Show>
                <Show when={image()}>
                  {(img) => (
                    <Show
                      when={clip()}
                      fallback={
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
                      }
                    >
                      <ClipFrame
                        src={img().url}
                        label={t("video.open")}
                        seconds={g().duration}
                        fresh={fresh()}
                        loaded={loaded()}
                        onLoaded={() => setLoaded(true)}
                        onOpen={() => props.onOpen(0)}
                      />
                    </Show>
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
            {props.model?.name ?? g().model} · {option()} · {g().aspectRatio}
            {clip() && g().duration ? ` · ${t("video.seconds", { n: g().duration ?? 0 })}` : ""} ·{" "}
            {t("images.cost", { n: credits() })}
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
            <Show when={props.onCharacter && g().images.length > 0 && !clip()}>
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

// A finished clip in its frame: the first frame at rest, playing muted while a mouse rests on it; a
// tap or click opens it in the viewer with sound and controls. "#t=0.1" makes iOS draw that first
// frame, which it otherwise leaves black until the clip plays.
function ClipFrame(props: {
  src: string
  label: string
  seconds: number | null
  fresh: boolean
  loaded: boolean
  onLoaded: () => void
  onOpen: () => void
}) {
  const { t } = useLanguage()
  let video: HTMLVideoElement | undefined
  return (
    <button
      type="button"
      class="group/img absolute inset-0 size-full cursor-pointer"
      aria-label={props.label}
      onClick={() => props.onOpen()}
      onPointerEnter={(event) => event.pointerType === "mouse" && void video?.play().catch(() => undefined)}
      onPointerLeave={() => video?.pause()}
    >
      <video
        ref={video}
        src={`${props.src}#t=0.1`}
        muted
        loop
        playsinline
        preload="metadata"
        aria-hidden="true"
        // iOS loads no frame data before a clip plays, so the metadata is the sign it is there.
        onLoadedMetadata={() => props.onLoaded()}
        onError={() => props.onLoaded()}
        class="size-full object-cover transition-[opacity,transform] duration-(--motion-standard) ease-standard group-hover/img:scale-[1.02]"
        classList={{ "opacity-0": !props.loaded, "animate-reveal": props.loaded && props.fresh }}
      />
      <span class="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-caption font-medium text-white backdrop-blur-sm">
        <IconPlay class="size-3" weight={2.25} />
        {props.seconds ? t("video.seconds", { n: props.seconds }) : ""}
      </span>
    </button>
  )
}
