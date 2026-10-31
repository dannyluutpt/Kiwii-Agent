import { Dialog as KDialog } from "@kobalte/core/dialog"
import { createEffect, createSignal, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { prepareFile, savesThroughShare } from "@/lib/save"
import { IconButton, iconButtonClass } from "@/ui/icon-button"
import {
  IconArrowRight,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconDownload,
  IconImage,
  IconPersonAdd,
  IconPlaceAdd,
  IconRefresh,
} from "./icons"
import { useShareFile } from "./save"

// `download` is the picture's download link; `name` is what it is saved as through the share sheet;
// `video` marks a clip, which plays with its controls; `character: false` hides saving the picture as
// a character where only some pictures can be.
export type LightboxItem = {
  src: string
  alt: string
  caption: string
  download: string
  name: string
  video?: boolean
  character?: boolean
}

// Full-screen viewer over a set of pictures: arrow keys, the side buttons or a horizontal swipe step
// through them; Escape, the close button or a tap on the backdrop leave. Kobalte traps focus, locks
// scrolling and hands focus back to the picture that opened it.
export function Lightbox(props: {
  items: LightboxItem[]
  // The open picture, or undefined while closed.
  index: number | undefined
  onIndex: (index: number) => void
  onClose: () => void
  onReuse?: (index: number) => void
  // Saves the open picture as a character, or as a location.
  onCharacter?: (index: number) => void
  onLocation?: (index: number) => void
  // Starts the next clip from the open clip: from its last frame, or from the frame at `at` seconds.
  onNextScene?: (index: number, at?: number) => void
}) {
  const { t } = useLanguage()
  // Keep showing the last picture while the viewer animates out after `index` is cleared.
  const [shown, setShown] = createSignal<{ items: LightboxItem[]; index: number }>()
  createEffect(() => {
    const index = props.index
    if (index !== undefined && props.items[index]) setShown({ items: props.items, index })
  })
  const item = () => {
    const state = shown()
    return state ? state.items[state.index] : undefined
  }
  let player: HTMLVideoElement | undefined
  const count = () => shown()?.items.length ?? 0
  const position = () => shown()?.index ?? 0
  const step = (delta: number) => {
    const next = position() + delta
    if (props.index === undefined || next < 0 || next >= count()) return
    props.onIndex(next)
  }

  // On iPhone and iPad, Download hands the picture to the share sheet ("Lưu hình ảnh"); the open
  // picture is fetched ahead so the sheet opens on the first tap. A clip is too large to fetch on
  // the chance it is saved: it is fetched on the tap, and a second tap opens the sheet if the first
  // one expired meanwhile.
  const share = savesThroughShare()
  const save = useShareFile()
  createEffect(() => {
    const current = item()
    if (share && current && !current.video && props.index !== undefined) void prepareFile(current.src, current.name)
  })

  // Preload the neighbouring pictures so stepping through feels instant.
  createEffect(() => {
    const state = shown()
    if (!state || props.index === undefined) return
    for (const neighbour of [state.items[state.index - 1], state.items[state.index + 1]]) {
      if (neighbour && !neighbour.video) new Image().src = neighbour.src
    }
  })

  let content: HTMLDivElement | undefined
  let opener: HTMLElement | undefined
  let touch: { x: number; y: number } | undefined

  return (
    <KDialog open={props.index !== undefined} onOpenChange={(open) => !open && props.onClose()}>
      <KDialog.Portal>
        <KDialog.Overlay class="k-overlay fixed inset-0 z-(--z-lightbox) bg-canvas" />
        <KDialog.Content
          ref={content}
          class="k-lightbox fixed inset-0 z-(--z-lightbox) flex flex-col pt-safe pb-safe text-label outline-none"
          // Focus the viewer itself: screen readers announce the picture, arrow keys work at once, and
          // no button tooltip pops up over the photo. With no trigger for Kobalte to return to, focus
          // goes back by hand to whatever opened the viewer, unless an action already moved it on
          // (Reuse focuses the prompt while the viewer fades out).
          onOpenAutoFocus={(event: Event) => {
            event.preventDefault()
            opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
            content?.focus()
          }}
          onCloseAutoFocus={(event: Event) => {
            event.preventDefault()
            const claimed = document.activeElement && document.activeElement !== document.body
            if (!claimed && opener?.isConnected) opener.focus({ preventScroll: true })
          }}
          onKeyDown={(event: KeyboardEvent) => {
            // In a playing clip the arrow keys seek.
            if (event.target instanceof HTMLVideoElement) return
            if (event.key === "ArrowLeft") step(-1)
            if (event.key === "ArrowRight") step(1)
          }}
        >
          <KDialog.Title class="sr-only">{item()?.alt}</KDialog.Title>
          <div class="flex items-center gap-2 p-3">
            <p class="flex-1 pl-2 text-subhead text-label-2 tabular-nums" aria-live="polite">
              <Show when={count() > 1}>{t("images.position", { n: position() + 1, total: count() })}</Show>
            </p>
            <Show when={props.onCharacter && !item()?.video && item()?.character !== false}>
              <IconButton
                label={t("characters.saveAs")}
                variant="overlay"
                size="xl"
                circle
                icon={<IconPersonAdd class="size-5" />}
                onClick={() => props.onCharacter?.(position())}
              />
            </Show>
            <Show when={props.onLocation && !item()?.video}>
              <IconButton
                label={t("locations.saveAs")}
                variant="overlay"
                size="xl"
                circle
                icon={<IconPlaceAdd class="size-5" />}
                onClick={() => props.onLocation?.(position())}
              />
            </Show>
            <Show when={props.onNextScene && item()?.video}>
              <IconButton
                label={t("video.useFrame")}
                variant="overlay"
                size="xl"
                circle
                icon={<IconImage class="size-5" />}
                onClick={() => {
                  player?.pause()
                  props.onNextScene?.(position(), player?.currentTime ?? 0)
                }}
              />
              <IconButton
                label={t("video.nextScene")}
                variant="overlay"
                size="xl"
                circle
                icon={<IconArrowRight class="size-5" />}
                onClick={() => props.onNextScene?.(position())}
              />
            </Show>
            <Show when={props.onReuse}>
              <IconButton
                label={t("images.reuse")}
                variant="overlay"
                size="xl"
                circle
                icon={<IconRefresh class="size-5" />}
                onClick={() => props.onReuse?.(position())}
              />
            </Show>
            <Show
              when={share}
              fallback={
                <a
                  href={item()?.download}
                  download=""
                  aria-label={t("images.download")}
                  class={iconButtonClass("overlay", "xl", undefined, true)}
                >
                  <IconDownload class="size-5" />
                </a>
              }
            >
              <IconButton
                label={t("images.download")}
                variant="overlay"
                size="xl"
                circle
                icon={<IconDownload class="size-5" />}
                onClick={() => {
                  const current = item()
                  if (current) void save(current.src, current.name)
                }}
              />
            </Show>
            <IconButton
              label={t("common.close")}
              keys="Esc"
              variant="overlay"
              size="xl"
              circle
              icon={<IconClose class="size-5" />}
              onClick={() => props.onClose()}
            />
          </div>

          <div
            class="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-2"
            onClick={(event) => event.target === event.currentTarget && props.onClose()}
            onTouchStart={(event) => {
              const point = event.touches[0]
              touch = event.touches.length === 1 && point ? { x: point.clientX, y: point.clientY } : undefined
            }}
            onTouchEnd={(event) => {
              const point = event.changedTouches[0]
              if (!touch || !point) return
              const dx = point.clientX - touch.x
              const dy = point.clientY - touch.y
              touch = undefined
              if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1)
            }}
          >
            <Show when={item()} keyed>
              {(current) => (
                <Show
                  when={current.video}
                  fallback={
                    <img
                      src={current.src}
                      alt={current.alt}
                      draggable={false}
                      class="max-h-full max-w-full touch-pinch-zoom select-none rounded-[14px] object-contain shadow-overlay animate-fade-in"
                    />
                  }
                >
                  <video
                    ref={player}
                    src={current.src}
                    aria-label={current.alt}
                    controls
                    autoplay
                    loop
                    playsinline
                    class="max-h-full max-w-full rounded-[14px] bg-black object-contain shadow-overlay animate-fade-in"
                  />
                </Show>
              )}
            </Show>
            <Show when={count() > 1}>
              <span class="absolute top-1/2 left-3 hidden -translate-y-1/2 pointer-fine:block">
                <IconButton
                  label={t("images.previous")}
                  keys="←"
                  variant="overlay"
                  size="xl"
                  circle
                  disabled={position() === 0}
                  icon={<IconChevronLeft class="size-5" weight={2.25} />}
                  onClick={() => step(-1)}
                />
              </span>
              <span class="absolute top-1/2 right-3 hidden -translate-y-1/2 pointer-fine:block">
                <IconButton
                  label={t("images.next")}
                  keys="→"
                  variant="overlay"
                  size="xl"
                  circle
                  disabled={position() === count() - 1}
                  icon={<IconChevronRight class="size-5" weight={2.25} />}
                  onClick={() => step(1)}
                />
              </span>
            </Show>
          </div>

          <Show when={item()?.caption}>
            <p class="mx-auto line-clamp-3 max-w-2xl px-6 pt-2 pb-5 text-center text-footnote text-label-2">
              {item()?.caption}
            </p>
          </Show>
        </KDialog.Content>
      </KDialog.Portal>
    </KDialog>
  )
}
