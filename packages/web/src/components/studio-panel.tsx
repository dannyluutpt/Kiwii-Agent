import { A } from "@solidjs/router"
import { Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { ImageModel, ModelsResponse, Reference, StudioSettings } from "@/images"
import { Button, buttonClass } from "@/ui/button"
import { IconButton } from "@/ui/icon-button"
import { IconImage, IconSparkles } from "./icons"
import { createReferenceUploads, ReferenceStrip } from "./references"
import { StudioOptions } from "./studio-options"

// The studio's control panel on wide screens: references and the prompt at the top, every option in
// view below, and the generate button pinned at the bottom. It fills the panel to the right of the
// gallery.
export function StudioPanel(props: {
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
  let fileInput: HTMLInputElement | undefined
  const model = () => props.config.models.find((m) => m.id === props.settings.model)
  const maxReferences = () => model()?.maxReferences ?? props.config.maxReferences
  const uploads = createReferenceUploads({
    references: () => props.references,
    onReferences: props.onReferences,
    maxCount: maxReferences,
    maxEdge: () => model()?.maxReferenceEdge ?? 2048,
  })

  const pick = (next: ImageModel) => {
    const option = next.options.some((o) => o.id === props.settings.option)
      ? props.settings.option
      : (next.options[0]?.id ?? "")
    const aspectRatio = next.aspectRatios.includes(props.settings.aspectRatio) ? props.settings.aspectRatio : "1:1"
    props.onSettings({ model: next.id, option, aspectRatio })
    if (props.references.length > next.maxReferences) props.onReferences(props.references.slice(0, next.maxReferences))
    void uploads.refit(next.maxReferenceEdge)
  }

  const canGenerate = () =>
    !props.busy && !props.locked && !uploads.uploading() && props.prompt.trim().length > 0 && props.cost !== undefined

  return (
    <form
      class="flex min-h-0 flex-1 flex-col"
      aria-label={t("images.options")}
      onSubmit={(event) => {
        event.preventDefault()
        if (canGenerate()) props.onGenerate()
      }}
    >
      <div class="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-4">
        <div class="flex flex-col gap-2">
          <ReferenceStrip
            references={props.references}
            uploading={uploads.uploading()}
            onRemove={(ref) => props.onReferences(props.references.filter((r) => r.id !== ref.id))}
          />
          <div class="rounded-[14px] bg-fill transition-shadow duration-(--motion-micro) focus-within:shadow-[0_0_0_1.5px_var(--k-focus)]">
            <textarea
              data-component="studio-textarea"
              data-studio-prompt
              class="min-h-28 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-body text-label outline-none placeholder:text-label-3 disabled:cursor-not-allowed"
              aria-label={t("images.placeholder")}
              enterkeyhint="go"
              rows={4}
              placeholder={t("images.placeholder")}
              value={props.prompt}
              disabled={props.locked}
              onInput={(event) => props.onPrompt(event.currentTarget.value)}
              onPaste={(event) => {
                const files = Array.from(event.clipboardData?.files ?? []).filter((file) =>
                  file.type.startsWith("image/"),
                )
                if (files.length === 0) return
                event.preventDefault()
                void uploads.upload(files)
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                  event.preventDefault()
                  if (canGenerate()) props.onGenerate()
                }
              }}
            />
            <div class="flex items-center px-1.5 pb-1.5">
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                class="hidden"
                onChange={(event) => event.currentTarget.files && void uploads.upload(event.currentTarget.files)}
              />
              <IconButton
                label={t("images.references.addHint", { n: maxReferences(), extra: props.config.referenceSurcharge })}
                size="md"
                icon={<IconImage class="size-5" />}
                disabled={props.locked || uploads.uploading() || props.references.length >= maxReferences()}
                onClick={() => fileInput?.click()}
              />
              <span class="text-caption text-label-3">{t("images.enterHint")}</span>
            </div>
          </div>
        </div>
        <Show when={model()}>
          {(m) => (
            <StudioOptions
              config={props.config}
              model={m()}
              settings={props.settings}
              onSettings={props.onSettings}
              onPickModel={pick}
              cost={props.cost}
            />
          )}
        </Show>
      </div>
      <div class="border-t border-separator p-4">
        <Show
          when={!props.locked}
          fallback={
            <A href="/pricing" class={buttonClass("primary", "lg", "w-full")}>
              {t("images.locked.cta")}
            </A>
          }
        >
          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            disabled={!canGenerate()}
            loading={props.busy}
            leading={<IconSparkles class="size-[18px]" />}
            aria-label={t("images.generateFor", { n: props.cost ?? 0 })}
          >
            {t("images.generateCost", { n: props.cost ?? "–" })}
          </Button>
        </Show>
      </div>
    </form>
  )
}
