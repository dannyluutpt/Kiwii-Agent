import { onCleanup, onMount, Show } from "solid-js"
import { IconButton } from "@kiwii/ui/icon-button"
import { useLanguage } from "@/context/language"

export function Lightbox(props: {
  src: string
  downloadHref: string
  caption?: string
  onClose: () => void
  onReuse?: () => void
}) {
  const { t } = useLanguage()
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape") props.onClose()
  }
  onMount(() => document.addEventListener("keydown", onKey))
  onCleanup(() => document.removeEventListener("keydown", onKey))
  return (
    <div
      class="fixed inset-0 z-50 flex flex-col bg-[rgba(0,0,0,0.92)] backdrop-blur-sm"
      role="dialog"
      aria-modal={true}
      onClick={() => props.onClose()}
    >
      <div class="flex items-center justify-end gap-1 p-3" onClick={(event) => event.stopPropagation()}>
        <Show when={props.onReuse}>
          <IconButton icon="reset" variant="ghost" aria-label={t("images.reuse")} onClick={() => props.onReuse?.()} />
        </Show>
        <a href={props.downloadHref} download="">
          <IconButton icon="download" variant="ghost" aria-label={t("images.download")} />
        </a>
        <IconButton icon="close" variant="ghost" aria-label="Close" onClick={() => props.onClose()} />
      </div>
      <div class="flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        <img
          src={props.src}
          alt=""
          class="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        />
      </div>
      <Show when={props.caption}>
        <p
          class="line-clamp-2 px-6 pb-5 text-center text-13-regular text-[rgba(255,255,255,0.7)]"
          onClick={(event) => event.stopPropagation()}
        >
          {props.caption}
        </p>
      </Show>
    </div>
  )
}
