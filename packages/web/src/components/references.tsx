import { createSignal, For, Show } from "solid-js"
import { apiUpload } from "@/api"
import { useLanguage } from "@/context/language"
import type { Reference } from "@/images"
import { errorMessage } from "@/lib/errors"
import { shrinkImage } from "@/lib/image"
import { IconButton } from "@/ui/icon-button"
import { Spinner } from "@/ui/spinner"
import { toast } from "@/ui/toast"
import { IconClose } from "./icons"

// Reference pictures for a run. Each is scaled in the browser to the chosen model's longest edge
// before it is uploaded; switching to a model with a smaller limit scales the stored copies again.
export function createReferenceUploads(input: {
  references: () => Reference[]
  onReferences: (next: Reference[]) => void
  maxCount: () => number
  maxEdge: () => number
}) {
  const { t } = useLanguage()
  const [uploading, setUploading] = createSignal(false)

  const store = async (file: File, max: number) => {
    const fitted = await shrinkImage(file, max)
    const form = new FormData()
    form.append("file", fitted.file)
    const stored = await apiUpload<{ id: string; url: string; name: string }>("/images/references", form).catch(
      (error: unknown) => {
        toast.error(errorMessage(error, t("error.generic")))
        return undefined
      },
    )
    return stored && { ...stored, edge: Math.max(fitted.width, fitted.height) }
  }

  const upload = async (list: FileList | File[]) => {
    const room = input.maxCount() - input.references().length
    const picked = Array.from(list)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, Math.max(0, room))
    if (picked.length === 0) return
    setUploading(true)
    const added: Reference[] = []
    for (const file of picked) {
      const stored = await store(file, input.maxEdge())
      if (stored) added.push(stored)
    }
    input.onReferences([...input.references(), ...added])
    setUploading(false)
  }

  // Scales down any reference larger than `max`, for a model that takes smaller pictures.
  const refit = async (max: number) => {
    const oversized = input.references().filter((ref) => ref.edge > max)
    if (oversized.length === 0) return
    setUploading(true)
    const next = [...input.references()]
    for (const ref of oversized) {
      const blob = await fetch(ref.url)
        .then((res) => (res.ok ? res.blob() : undefined))
        .catch(() => undefined)
      if (!blob) continue
      const stored = await store(new File([blob], ref.name, { type: blob.type }), max)
      const at = next.findIndex((r) => r.id === ref.id)
      if (stored && at >= 0) next[at] = stored
    }
    input.onReferences(next)
    setUploading(false)
  }

  return { upload, refit, uploading }
}

// Thumbnails of the references with a remove button each, and a spinner while one is on its way.
export function ReferenceStrip(props: {
  references: Reference[]
  uploading: boolean
  onRemove: (ref: Reference) => void
  class?: string
}) {
  const { t } = useLanguage()
  return (
    <Show when={props.references.length > 0 || props.uploading}>
      <ul class={`flex gap-2 overflow-x-auto ${props.class ?? ""}`} aria-label={t("images.references")}>
        <For each={props.references}>
          {(ref) => (
            <li class="relative size-14 shrink-0 overflow-hidden rounded-[12px] bg-fill animate-fade-in">
              <img src={ref.url} alt={ref.name} class="size-full object-cover" />
              <span class="absolute top-0.5 right-0.5">
                <IconButton
                  label={`${t("images.references.remove")}: ${ref.name}`}
                  variant="overlay"
                  size="xs"
                  circle
                  tooltip={false}
                  icon={<IconClose class="size-3.5" weight={2.25} />}
                  onClick={() => props.onRemove(ref)}
                />
              </span>
            </li>
          )}
        </For>
        <Show when={props.uploading}>
          <li class="flex size-14 shrink-0 items-center justify-center rounded-[12px] bg-fill text-label-2">
            <Spinner class="size-5" label={t("chat.uploading")} />
          </li>
        </Show>
      </ul>
    </Show>
  )
}
