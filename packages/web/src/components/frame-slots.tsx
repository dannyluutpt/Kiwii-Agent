import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { Reference } from "@/images"
import { IconButton } from "@/ui/icon-button"
import { Spinner } from "@/ui/spinner"
import { IconArrowRight, IconClose, IconPlus } from "./icons"
import { createReferenceUploads } from "./references"

// The picture a clip ends on, uploaded like a reference: one at most, scaled to the model's edge.
export function createLastFrameUploads(input: {
  last: () => Reference | undefined
  onLast: (next: Reference | undefined) => void
  maxEdge: () => number
}) {
  return createReferenceUploads({
    references: () => {
      const last = input.last()
      return last ? [last] : []
    },
    onReferences: (next) => input.onLast(next[0]),
    maxCount: () => 1,
    maxEdge: input.maxEdge,
  })
}

// A clip's pictures in video mode: the first frame it starts from (added with the composer's picture
// button) and, once there is one, a slot for the last frame it ends on.
export function FrameSlots(props: {
  first: Reference | undefined
  firstUploading: boolean
  onRemoveFirst: () => void
  last: Reference | undefined
  lastUploads: ReturnType<typeof createLastFrameUploads>
  onRemoveLast: () => void
  // Whether the clip's model can end on a picture.
  canEnd: boolean
  disabled?: boolean
  class?: string
}) {
  const { t } = useLanguage()
  let input: HTMLInputElement | undefined
  return (
    <Show when={props.first || props.firstUploading}>
      <div role="group" aria-label={t("video.frames")} class={`flex items-start gap-2 ${props.class ?? ""}`}>
        <Frame
          label={t("video.frame.first")}
          picture={props.first}
          uploading={props.firstUploading}
          removeLabel={t("video.frame.removeFirst")}
          onRemove={props.onRemoveFirst}
        />
        <Show when={props.canEnd && props.first}>
          <IconArrowRight class="mt-5 size-4 shrink-0 text-label-3" />
          <Show
            when={props.last || props.lastUploads.uploading()}
            fallback={
              <div class="flex w-16 shrink-0 flex-col items-center gap-1">
                <button
                  type="button"
                  class="flex size-14 items-center justify-center rounded-[12px] border border-dashed border-separator text-label-2 transition-colors duration-(--motion-micro) hover:border-accent hover:text-accent disabled:opacity-50"
                  aria-label={t("video.lastFrame")}
                  disabled={props.disabled}
                  onClick={() => input?.click()}
                >
                  <IconPlus class="size-5" />
                </button>
                <span class="whitespace-nowrap text-caption text-label-2" aria-hidden="true">
                  {t("video.frame.last")}
                </span>
              </div>
            }
          >
            <Frame
              label={t("video.frame.last")}
              picture={props.last}
              uploading={props.lastUploads.uploading()}
              removeLabel={t("video.frame.removeLast")}
              onRemove={props.onRemoveLast}
            />
          </Show>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="hidden"
            data-input="last-frame"
            onChange={(event) => {
              const files = event.currentTarget.files
              if (files) void props.lastUploads.upload(files)
              event.currentTarget.value = ""
            }}
          />
        </Show>
      </div>
    </Show>
  )
}

// One frame: its thumbnail with a remove button, or a spinner while it uploads, over its name.
function Frame(props: {
  label: string
  picture: Reference | undefined
  uploading: boolean
  removeLabel: string
  onRemove: () => void
}) {
  const { t } = useLanguage()
  return (
    <div class="flex w-16 shrink-0 flex-col items-center gap-1">
      <Show
        when={props.picture}
        fallback={
          <div class="flex size-14 items-center justify-center rounded-[12px] bg-fill text-label-2">
            <Spinner class="size-5" label={t("images.uploading")} />
          </div>
        }
      >
        {(picture) => (
          <div class="rim relative size-14 overflow-hidden rounded-[12px] bg-fill shadow-raised animate-fade-in">
            <img src={picture().url} alt={props.label} class="size-full object-cover" />
            <span class="absolute top-0.5 right-0.5">
              <IconButton
                label={props.removeLabel}
                variant="overlay"
                size="xs"
                circle
                tooltip={false}
                icon={<IconClose class="size-3.5" weight={2.25} />}
                onClick={props.onRemove}
              />
            </span>
          </div>
        )}
      </Show>
      <span class="whitespace-nowrap text-caption text-label-2" aria-hidden="true">
        {props.label}
      </span>
    </div>
  )
}
