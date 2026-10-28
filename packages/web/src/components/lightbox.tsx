import { onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { iconButtonClass, IconButton } from "@/ui/icon-button"
import { IconClose, IconDownload, IconRefresh } from "./icons"

export function Lightbox(props: {
  src: string
  downloadHref: string
  caption?: string
  onClose: () => void
  onReuse?: () => void
}) {
  const { t } = useLanguage()
  let closeButton: HTMLButtonElement | undefined
  const previous = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") props.onClose()
  }
  onMount(() => {
    document.addEventListener("keydown", onKey)
    closeButton?.focus()
  })
  onCleanup(() => {
    document.removeEventListener("keydown", onKey)
    previous?.focus()
  })
  return (
    <div
      class="fixed inset-0 z-(--z-lightbox) flex flex-col bg-black/90 pt-safe pb-safe animate-fade-in"
      role="dialog"
      aria-modal={true}
      aria-label={props.caption ?? t("images.download")}
      onClick={() => props.onClose()}
    >
      <div class="flex items-center justify-end gap-2 p-3" onClick={(event) => event.stopPropagation()}>
        <Show when={props.onReuse}>
          <IconButton
            label={t("images.reuse")}
            variant="overlay"
            size="lg"
            circle
            icon={<IconRefresh class="size-5" />}
            onClick={() => props.onReuse?.()}
          />
        </Show>
        <a
          href={props.downloadHref}
          download=""
          aria-label={t("images.download")}
          class={iconButtonClass("overlay", "lg", undefined, true)}
        >
          <IconDownload class="size-5" />
        </a>
        <IconButton
          ref={closeButton}
          label={t("common.close")}
          variant="overlay"
          size="lg"
          circle
          icon={<IconClose class="size-5" />}
          onClick={() => props.onClose()}
        />
      </div>
      <div class="flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        <img
          src={props.src}
          alt={props.caption?.slice(0, 120) ?? ""}
          class="max-h-full max-w-full rounded-[14px] object-contain shadow-overlay"
          onClick={(event) => event.stopPropagation()}
        />
      </div>
      <Show when={props.caption}>
        <p
          class="line-clamp-2 px-6 pb-5 text-center text-footnote text-white/70"
          onClick={(event) => event.stopPropagation()}
        >
          {props.caption}
        </p>
      </Show>
    </div>
  )
}
