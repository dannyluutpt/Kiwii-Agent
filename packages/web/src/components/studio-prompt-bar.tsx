import { createSignal, For, Show, type JSX } from "solid-js"
import { apiUpload } from "@/api"
import { useLanguage } from "@/context/language"
import type { ImageModel, ModelsResponse, Reference } from "@/images"
import { errorMessage } from "@/lib/errors"
import { Button } from "@/ui/button"
import { IconButton } from "@/ui/icon-button"
import { Spinner } from "@/ui/spinner"
import { toast } from "@/ui/toast"
import { IconClose, IconImage } from "./icons"

export type StudioSettings = {
  model: string
  option: string
  aspectRatio: string
  n: number
  enhance: boolean
}

const pill = (active: boolean) =>
  `h-8 rounded-full px-3 text-subhead font-medium transition-[color,background-color] duration-(--motion-micro) pointer-coarse:h-9 ${
    active ? "bg-label text-canvas" : "bg-fill text-label-2 hover:bg-fill-2 hover:text-label"
  }`

export function StudioPromptBar(props: {
  config: ModelsResponse
  settings: StudioSettings
  onSettings: (patch: Partial<StudioSettings>) => void
  prompt: string
  onPrompt: (value: string) => void
  references: Reference[]
  onReferences: (next: Reference[]) => void
  cost: number | undefined
  busy: boolean
  locked: boolean
  onGenerate: () => void
}) {
  const { t } = useLanguage()
  const [uploading, setUploading] = createSignal(false)
  let fileInput: HTMLInputElement | undefined
  let textarea: HTMLTextAreaElement | undefined

  const model = () => props.config.models.find((m) => m.id === props.settings.model)
  const maxReferences = () => model()?.maxReferences ?? props.config.maxReferences

  const pick = (next: ImageModel) => {
    const option = next.options.some((o) => o.id === props.settings.option)
      ? props.settings.option
      : (next.options[0]?.id ?? "")
    const aspectRatio = next.aspectRatios.includes(props.settings.aspectRatio) ? props.settings.aspectRatio : "1:1"
    props.onSettings({ model: next.id, option, aspectRatio })
    if (props.references.length > next.maxReferences) props.onReferences(props.references.slice(0, next.maxReferences))
  }

  const upload = async (list: FileList | null) => {
    if (!list || list.length === 0) return
    const room = maxReferences() - props.references.length
    const picked = Array.from(list).slice(0, Math.max(0, room))
    if (picked.length === 0) return
    setUploading(true)
    const added: Reference[] = []
    for (const file of picked) {
      const form = new FormData()
      form.append("file", file)
      const stored = await apiUpload<Reference>("/images/references", form).catch((error: unknown) => {
        toast.error(errorMessage(error, t("error.generic")))
        return undefined
      })
      if (stored) added.push(stored)
    }
    props.onReferences([...props.references, ...added])
    setUploading(false)
    if (fileInput) fileInput.value = ""
  }

  const canGenerate = () => !props.busy && !props.locked && props.prompt.trim().length > 0 && props.cost !== undefined

  return (
    <form
      class="mx-auto flex w-full max-w-5xl flex-col gap-3 rounded-panel bg-surface p-3 shadow-floating"
      onSubmit={(event) => {
        event.preventDefault()
        if (canGenerate()) props.onGenerate()
      }}
    >
      <div class="grid gap-2 sm:grid-cols-3">
        <For each={props.config.models}>
          {(m) => (
            <button
              type="button"
              class="flex flex-col items-start gap-0.5 rounded-[14px] px-3 py-2 text-left transition-[color,background-color] duration-(--motion-micro)"
              classList={{
                "bg-accent-soft shadow-[inset_0_0_0_1.5px_var(--k-accent)]": m.id === props.settings.model,
                "bg-fill hover:bg-fill-2": m.id !== props.settings.model,
              }}
              aria-pressed={m.id === props.settings.model}
              onClick={() => pick(m)}
            >
              <span class="text-subhead font-semibold text-label">{m.name}</span>
              <span class="text-caption text-label-2">{m.tagline}</span>
            </button>
          )}
        </For>
      </div>

      <Show when={props.references.length > 0}>
        <div class="flex flex-wrap gap-2">
          <For each={props.references}>
            {(ref) => (
              <div class="relative size-16 overflow-hidden rounded-[12px] shadow-raised">
                <img src={ref.url} alt={ref.name} class="size-full object-cover" />
                <span class="absolute top-1 right-1">
                  <IconButton
                    label={`${t("images.references.remove")}: ${ref.name}`}
                    variant="overlay"
                    size="xs"
                    circle
                    tooltip={false}
                    icon={<IconClose class="size-3.5" weight={2.25} />}
                    onClick={() => props.onReferences(props.references.filter((r) => r.id !== ref.id))}
                  />
                </span>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class="flex items-end gap-2">
        <textarea
          ref={textarea}
          class="min-h-12 flex-1 resize-none bg-transparent px-1 py-2 text-body text-label outline-none placeholder:text-label-3"
          aria-label={t("images.placeholder")}
          enterkeyhint="go"
          data-studio-prompt
          rows={2}
          placeholder={t("images.placeholder")}
          value={props.prompt}
          disabled={props.locked}
          onInput={(event) => props.onPrompt(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
              event.preventDefault()
              if (canGenerate()) props.onGenerate()
            }
          }}
        />
      </div>

      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Group label={t("images.quality")}>
          <For each={model()?.options ?? []}>
            {(o) => (
              <button
                type="button"
                class={pill(o.id === props.settings.option)}
                aria-pressed={o.id === props.settings.option}
                onClick={() => props.onSettings({ option: o.id })}
              >
                {o.label} <span class="opacity-70">· {o.credits}</span>
              </button>
            )}
          </For>
        </Group>
        <Group label={t("images.aspect")}>
          <For each={model()?.aspectRatios ?? []}>
            {(ratio) => (
              <button
                type="button"
                class={pill(ratio === props.settings.aspectRatio)}
                aria-pressed={ratio === props.settings.aspectRatio}
                onClick={() => props.onSettings({ aspectRatio: ratio })}
              >
                {ratio}
              </button>
            )}
          </For>
        </Group>
        <Group label={t("images.count")}>
          <For each={Array.from({ length: props.config.maxImages }, (_, i) => i + 1)}>
            {(n) => (
              <button
                type="button"
                class={pill(n === props.settings.n)}
                aria-pressed={n === props.settings.n}
                onClick={() => props.onSettings({ n })}
              >
                {n}
              </button>
            )}
          </For>
        </Group>
        <label
          class="flex cursor-pointer items-center gap-2 text-subhead text-label-2"
          title={t("images.enhance.hint")}
        >
          <input
            type="checkbox"
            class="size-4 accent-[var(--k-accent)]"
            checked={props.settings.enhance}
            onChange={(event) => props.onSettings({ enhance: event.currentTarget.checked })}
          />
          {t("images.enhance")}
        </label>
        <div
          class="flex items-center gap-1 text-subhead text-label-2"
          title={t("images.references.hint", { n: maxReferences(), extra: props.config.referenceSurcharge })}
        >
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            class="hidden"
            onChange={(event) => void upload(event.currentTarget.files)}
          />
          <Show when={!uploading()} fallback={<Spinner class="size-4" label={t("chat.uploading")} />}>
            <IconButton
              icon={<IconImage class="size-[18px]" />}
              size="sm"
              label={t("images.references.add")}
              disabled={props.locked || props.references.length >= maxReferences()}
              onClick={() => fileInput?.click()}
            />
          </Show>
          <span>
            {t("images.references")} {props.references.length}/{maxReferences()}
          </span>
        </div>
        <div class="flex-1" />
        <Button type="submit" variant="primary" disabled={!canGenerate()} loading={props.busy}>
          <Show when={!props.busy} fallback={t("images.generating")}>
            {t("images.generate")}
            <Show when={props.cost !== undefined}> · {t("images.cost", { n: props.cost ?? 0 })}</Show>
          </Show>
        </Button>
      </div>
    </form>
  )
}

function Group(props: { label: string; children: JSX.Element }) {
  return (
    <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label={props.label}>
      <span class="text-footnote text-label-2">{props.label}</span>
      <div class="flex flex-wrap gap-1">{props.children}</div>
    </div>
  )
}
