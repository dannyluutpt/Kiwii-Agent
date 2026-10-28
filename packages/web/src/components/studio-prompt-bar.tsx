import { A } from "@solidjs/router"
import { createSignal, For, Show } from "solid-js"
import { apiUpload } from "@/api"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import type { ImageModel, ModelsResponse, Reference, StudioSettings } from "@/images"
import { errorMessage } from "@/lib/errors"
import { shrinkImage } from "@/lib/image"
import { Button, buttonClass } from "@/ui/button"
import { IconButton } from "@/ui/icon-button"
import { Menu, MenuContent, MenuRadioGroup } from "@/ui/menu"
import { Popover, PopoverContent } from "@/ui/popover"
import { Sheet } from "@/ui/sheet"
import { Spinner } from "@/ui/spinner"
import { toast } from "@/ui/toast"
import { IconChevronDown, IconClose, IconImage, IconSliders, IconSparkles } from "./icons"
import { StudioOptions } from "./studio-options"

const CHIP =
  "inline-flex h-9 min-w-0 items-center gap-1.5 rounded-full bg-fill px-3 text-subhead font-medium text-label transition-[background-color] duration-(--motion-micro) hover:bg-fill-2 data-[expanded]:bg-fill-2 pointer-coarse:h-10"

// The studio composer: references, the prompt, then one toolbar row with the model, a summary of
// the run options and the generate button showing what the run will cost.
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
  const layout = useLayout()
  const [uploading, setUploading] = createSignal(false)
  const [sheet, setSheet] = createSignal(false)
  let fileInput: HTMLInputElement | undefined

  const model = () => props.config.models.find((m) => m.id === props.settings.model)
  const maxReferences = () => model()?.maxReferences ?? props.config.maxReferences
  const option = () => model()?.options.find((o) => o.id === props.settings.option)
  const summary = () =>
    [option()?.label, props.settings.aspectRatio, t("images.countShort", { n: props.settings.n })]
      .filter(Boolean)
      .join(" · ")
  const phoneSummary = () =>
    [props.settings.aspectRatio, props.settings.n > 1 ? t("images.countShort", { n: props.settings.n }) : ""]
      .filter(Boolean)
      .join(" · ")

  const pick = (next: ImageModel) => {
    const option = next.options.some((o) => o.id === props.settings.option)
      ? props.settings.option
      : (next.options[0]?.id ?? "")
    const aspectRatio = next.aspectRatios.includes(props.settings.aspectRatio) ? props.settings.aspectRatio : "1:1"
    props.onSettings({ model: next.id, option, aspectRatio })
    if (props.references.length > next.maxReferences) props.onReferences(props.references.slice(0, next.maxReferences))
  }

  const upload = async (list: FileList | File[]) => {
    const room = maxReferences() - props.references.length
    const picked = Array.from(list)
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, Math.max(0, room))
    if (picked.length === 0) return
    setUploading(true)
    const added: Reference[] = []
    for (const file of picked) {
      const form = new FormData()
      form.append("file", await shrinkImage(file))
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
  const options = (withModels?: boolean) => (
    <Show when={model()}>
      {(m) => (
        <StudioOptions
          config={props.config}
          model={m()}
          settings={props.settings}
          onSettings={props.onSettings}
          onPickModel={withModels ? pick : undefined}
          cost={props.cost}
        />
      )}
    </Show>
  )

  return (
    <form
      class="mx-auto flex w-full max-w-3xl flex-col rounded-panel bg-surface shadow-floating transition-shadow duration-(--motion-micro) focus-within:shadow-[var(--k-shadow-floating),0_0_0_1.5px_var(--k-focus)]"
      onSubmit={(event) => {
        event.preventDefault()
        if (canGenerate()) props.onGenerate()
      }}
    >
      <Show when={props.references.length > 0 || uploading()}>
        <ul class="flex gap-2 overflow-x-auto px-3 pt-3" aria-label={t("images.references")}>
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
                    onClick={() => props.onReferences(props.references.filter((r) => r.id !== ref.id))}
                  />
                </span>
              </li>
            )}
          </For>
          <Show when={uploading()}>
            <li class="flex size-14 shrink-0 items-center justify-center rounded-[12px] bg-fill text-label-2">
              <Spinner class="size-5" label={t("chat.uploading")} />
            </li>
          </Show>
        </ul>
      </Show>

      <textarea
        data-component="studio-textarea"
        data-studio-prompt
        class="min-h-12 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-body text-label outline-none placeholder:text-label-3 disabled:cursor-not-allowed"
        aria-label={t("images.placeholder")}
        enterkeyhint="go"
        rows={2}
        placeholder={t("images.placeholder")}
        value={props.prompt}
        disabled={props.locked}
        onInput={(event) => props.onPrompt(event.currentTarget.value)}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"))
          if (files.length === 0) return
          event.preventDefault()
          void upload(files)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault()
            if (canGenerate()) props.onGenerate()
          }
        }}
      />

      <div class="flex items-center gap-1 p-1.5 pt-1">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          class="hidden"
          onChange={(event) => event.currentTarget.files && void upload(event.currentTarget.files)}
        />
        <IconButton
          label={t("images.references.addHint", { n: maxReferences(), extra: props.config.referenceSurcharge })}
          size="lg"
          icon={<IconImage class="size-[22px]" />}
          disabled={props.locked || uploading() || props.references.length >= maxReferences()}
          onClick={() => fileInput?.click()}
        />

        <Show
          when={layout.phone()}
          fallback={
            <>
              <Show
                when={props.config.models.length > 1}
                fallback={<span class={`${CHIP} pointer-events-none`}>{model()?.name}</span>}
              >
                <Menu placement="top-start" gutter={8}>
                  <Menu.Trigger
                    class={CHIP}
                    disabled={props.locked}
                    aria-label={t("images.modelPick", { name: model()?.name ?? "" })}
                  >
                    <span class="truncate">{model()?.name}</span>
                    <IconChevronDown class="size-3.5 shrink-0 text-label-2" weight={2.25} />
                  </Menu.Trigger>
                  <MenuContent class="w-[min(340px,calc(100vw-24px))]">
                    <MenuRadioGroup
                      closeOnSelect
                      label={t("images.model")}
                      value={props.settings.model}
                      onChange={(id) => {
                        const next = props.config.models.find((m) => m.id === id)
                        if (next) pick(next)
                      }}
                      options={props.config.models.map((m) => ({ value: m.id, label: m.name, description: m.tagline }))}
                    />
                  </MenuContent>
                </Menu>
              </Show>
              <Popover placement="top-start" gutter={8}>
                <Popover.Trigger
                  class={CHIP}
                  disabled={props.locked}
                  aria-label={`${t("images.options")}: ${summary()}`}
                >
                  <IconSliders class="size-4 shrink-0 text-label-2" />
                  <span class="truncate">{summary()}</span>
                </Popover.Trigger>
                <PopoverContent label={t("images.options")}>{options()}</PopoverContent>
              </Popover>
            </>
          }
        >
          {/* Phones have room for one chip: the model leads, and the sheet holds every choice. */}
          <button
            type="button"
            class={CHIP}
            disabled={props.locked}
            aria-haspopup="dialog"
            aria-label={`${t("images.options")}: ${model()?.name ?? ""}, ${summary()}`}
            onClick={() => setSheet(true)}
          >
            <IconSliders class="size-4 shrink-0 text-label-2" />
            <span class="truncate">
              {model()?.name}
              <span class="text-label-2"> · {phoneSummary()}</span>
            </span>
          </button>
          <Sheet side="bottom" open={sheet()} onOpenChange={setSheet} label={t("images.options")}>
            <div data-sheet-handle class="grid touch-none grid-cols-[1fr_auto_1fr] items-center px-4 pt-1 pb-3">
              <span />
              <p class="text-headline text-label" aria-hidden="true">
                {t("images.options")}
              </p>
              <button
                type="button"
                class="justify-self-end px-1 py-2 text-callout font-semibold text-accent"
                onClick={() => setSheet(false)}
              >
                {t("common.done")}
              </button>
            </div>
            <div class="overflow-y-auto px-4 pb-4">{options(true)}</div>
          </Sheet>
        </Show>

        <span class="flex-1" />

        <Show
          when={!props.locked}
          fallback={
            <A href="/pricing" class={buttonClass("primary", "md")}>
              {t("images.locked.cta")}
            </A>
          }
        >
          <Button
            type="submit"
            variant="primary"
            pill
            disabled={!canGenerate()}
            loading={props.busy}
            leading={<IconSparkles class="size-[18px]" />}
            aria-label={t("images.generateFor", { n: props.cost ?? 0 })}
          >
            <span class="hidden sm:inline">{t("images.generateCost", { n: props.cost ?? "–" })}</span>
            <span class="sm:hidden">{props.cost ?? "–"}</span>
          </Button>
        </Show>
      </div>
    </form>
  )
}
