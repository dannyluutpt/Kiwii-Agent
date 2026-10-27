import { createSignal, For, Show } from "solid-js"
import { Button } from "@kiwii/ui/button"
import { IconButton } from "@kiwii/ui/icon-button"
import { Spinner } from "@kiwii/ui/spinner"
import { showToast } from "@kiwii/ui/toast"
import { ApiError, apiUpload } from "@/api"
import { useLanguage } from "@/context/language"
import type { ImageModel, ModelsResponse, Reference } from "@/images"

export type StudioSettings = {
  model: string
  option: string
  aspectRatio: string
  n: number
  enhance: boolean
}

const pill = (active: boolean) =>
  `rounded-full border px-3 py-1 text-13-medium transition-colors ${
    active
      ? "border-border-strong-base bg-surface-raised-strong text-text-strong"
      : "border-border-weak-base text-text-weak hover:border-border-base hover:text-text-base"
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
    try {
      const added: Reference[] = []
      for (const file of picked) {
        const form = new FormData()
        form.append("file", file)
        added.push(await apiUpload<Reference>("/images/references", form))
      }
      props.onReferences([...props.references, ...added])
    } catch (error) {
      showToast({ title: error instanceof ApiError ? error.message : t("error.generic"), variant: "error" })
    } finally {
      setUploading(false)
      if (fileInput) fileInput.value = ""
    }
  }

  const canGenerate = () => !props.busy && !props.locked && props.prompt.trim().length > 0 && props.cost !== undefined

  return (
    <form
      class="mx-auto flex w-full max-w-5xl flex-col gap-3 rounded-2xl border border-border-weak-base bg-surface-raised-base p-3 shadow-sm focus-within:border-border-focus"
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
              class="flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left transition-colors"
              classList={{
                "border-border-strong-base bg-surface-raised-strong": m.id === props.settings.model,
                "border-border-weak-base hover:border-border-base": m.id !== props.settings.model,
              }}
              onClick={() => pick(m)}
            >
              <span class="text-14-medium text-text-strong">{m.name}</span>
              <span class="text-12-regular text-text-weak">{m.tagline}</span>
            </button>
          )}
        </For>
      </div>

      <Show when={props.references.length > 0}>
        <div class="flex flex-wrap gap-2">
          <For each={props.references}>
            {(ref) => (
              <div class="group/ref relative size-16 overflow-hidden rounded-lg border border-border-weak-base">
                <img src={ref.url} alt={ref.name} class="size-full object-cover" />
                <button
                  type="button"
                  class="absolute right-0.5 top-0.5 hidden size-5 items-center justify-center rounded-full bg-[rgba(0,0,0,0.7)] text-[#fff] group-hover/ref:flex"
                  aria-label={t("images.references.remove")}
                  onClick={() => props.onReferences(props.references.filter((r) => r.id !== ref.id))}
                >
                  ×
                </button>
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class="flex items-end gap-2">
        <textarea
          ref={textarea}
          class="min-h-12 flex-1 resize-none bg-transparent px-1 py-2 text-14-regular text-text-strong outline-none placeholder:text-text-weak"
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
                onClick={() => props.onSettings({ option: o.id })}
              >
                {o.label} <span class="text-11-regular opacity-70">· {o.credits}</span>
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
              <button type="button" class={pill(n === props.settings.n)} onClick={() => props.onSettings({ n })}>
                {n}
              </button>
            )}
          </For>
        </Group>
        <label
          class="flex cursor-pointer items-center gap-2 text-13-regular text-text-weak"
          title={t("images.enhance.hint")}
        >
          <input
            type="checkbox"
            class="accent-[var(--color-surface-brand-base)]"
            checked={props.settings.enhance}
            onChange={(event) => props.onSettings({ enhance: event.currentTarget.checked })}
          />
          {t("images.enhance")}
        </label>
        <div
          class="flex items-center gap-1 text-13-regular text-text-weak"
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
          <Show when={!uploading()} fallback={<Spinner class="size-4" />}>
            <IconButton
              icon="photo"
              variant="ghost"
              size="small"
              type="button"
              aria-label={t("images.references.add")}
              disabled={props.locked || props.references.length >= maxReferences()}
              onClick={() => fileInput?.click()}
            />
          </Show>
          <span>
            {t("images.references")} {props.references.length}/{maxReferences()}
          </span>
        </div>
        <div class="flex-1" />
        <Button type="submit" variant="primary" disabled={!canGenerate()}>
          <Show when={!props.busy} fallback={t("images.generating")}>
            {t("images.generate")}
            <Show when={props.cost !== undefined}> · {t("images.cost", { n: props.cost ?? 0 })}</Show>
          </Show>
        </Button>
      </div>
    </form>
  )
}

function Group(props: { label: string; children: import("solid-js").JSX.Element }) {
  return (
    <div class="flex items-center gap-1.5">
      <span class="text-12-regular text-text-weaker">{props.label}</span>
      <div class="flex flex-wrap gap-1">{props.children}</div>
    </div>
  )
}
