import { A } from "@solidjs/router"
import { createSignal, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type {
  ImageModel,
  ModelsResponse,
  Reference,
  StudioMode,
  StudioSettings,
  VideoModel,
  VideoModelsResponse,
  VideoSettings,
} from "@/images"
import { Button, buttonClass } from "@/ui/button"
import { IconButton } from "@/ui/icon-button"
import { Sheet } from "@/ui/sheet"
import { CastStrip, CharacterOptions } from "./characters"
import { IconImage, IconSliders, IconSparkles } from "./icons"
import { createReferenceUploads, ReferenceStrip } from "./references"
import { StudioOptions } from "./studio-options"
import { fitVideoModel, ModeSwitch, VideoStudioOptions } from "./video-options"

const CHIP =
  "flex h-9 min-w-0 items-center gap-1.5 rounded-full bg-fill bg-gloss px-3 text-subhead font-medium text-label shadow-gloss transition-[background-color] duration-(--motion-micro) hover:bg-gloss-hover disabled:opacity-50 pointer-coarse:h-10"

// The phone composer, docked under the gallery: pictures or a clip, references, the prompt, then one
// chip that opens every option in a bottom sheet, and the generate button showing what the run will
// cost. A clip takes at most one picture, its first frame.
export function StudioPromptBar(props: {
  config: ModelsResponse
  settings: StudioSettings
  onSettings: (patch: Partial<StudioSettings>) => void
  mode: StudioMode
  onMode: (mode: StudioMode) => void
  videoConfig: VideoModelsResponse | undefined
  video: VideoSettings
  onVideo: (patch: Partial<VideoSettings>) => void
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
  const [sheet, setSheet] = createSignal(false)
  let fileInput: HTMLInputElement | undefined

  const clip = () => props.mode === "video"
  const model = () => props.config.models.find((m) => m.id === props.settings.model)
  const clipModel = () => props.videoConfig?.models.find((m) => m.id === props.video.model)
  const maxReferences = () =>
    clip() ? (clipModel()?.maxReferences ?? 1) : (model()?.maxReferences ?? props.config.maxReferences)
  const maxEdge = () => (clip() ? clipModel()?.maxReferenceEdge : model()?.maxReferenceEdge) ?? 2048
  const summary = () =>
    clip()
      ? `${t("video.seconds", { n: props.video.duration })} · ${props.video.aspectRatio}`
      : [props.settings.aspectRatio, props.settings.n > 1 ? t("images.countShort", { n: props.settings.n }) : ""]
          .filter(Boolean)
          .join(" · ")
  const uploads = createReferenceUploads({
    references: () => props.references,
    onReferences: props.onReferences,
    maxCount: maxReferences,
    maxEdge,
  })
  const addLabel = () => {
    const extra = clip() ? (clipModel()?.firstFrameCredits ?? 0) : (model()?.referenceSurcharge ?? 0)
    if (clip()) return extra ? t("video.firstFrameExtra", { extra }) : t("video.firstFrame")
    return t(extra ? "images.references.addHint" : "images.references.addHintFree", { n: maxReferences(), extra })
  }
  const pickClip = (next: VideoModel) => {
    props.onVideo(fitVideoModel(next, props.video))
    void uploads.refit(next.maxReferenceEdge)
  }

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
      class="mx-auto flex w-full max-w-3xl flex-col rounded-panel bg-surface bg-sheen shadow-floating transition-shadow duration-(--motion-standard) focus-within:shadow-[var(--k-shadow-floating),var(--k-shadow-focus)]"
      onSubmit={(event) => {
        event.preventDefault()
        if (canGenerate()) props.onGenerate()
      }}
    >
      <ModeSwitch
        class="mx-3 mt-3 self-start"
        value={props.mode}
        onChange={(mode) => {
          props.onMode(mode)
          void uploads.refit(maxEdge())
        }}
      />
      <ReferenceStrip
        class="px-3 pt-3"
        references={props.references}
        uploading={uploads.uploading()}
        onRemove={(ref) => props.onReferences(props.references.filter((r) => r.id !== ref.id))}
      />
      <Show when={!clip()}>
        <CastStrip class="px-3 pt-3" />
      </Show>

      <textarea
        data-component="studio-textarea"
        data-studio-prompt
        class="min-h-12 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-body text-label outline-none placeholder:text-label-3 disabled:cursor-not-allowed"
        aria-label={clip() ? t("video.placeholder") : t("images.placeholder")}
        enterkeyhint="go"
        rows={2}
        placeholder={clip() ? (props.locked ? t("video.locked") : t("video.placeholder")) : t("images.placeholder")}
        value={props.prompt}
        disabled={props.locked}
        onInput={(event) => props.onPrompt(event.currentTarget.value)}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"))
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

      <div class="flex items-center gap-1 p-1.5 pt-1">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple={!clip()}
          class="hidden"
          onChange={(event) => event.currentTarget.files && void uploads.upload(event.currentTarget.files)}
        />
        <IconButton
          label={addLabel()}
          size="lg"
          icon={<IconImage class="size-[22px]" />}
          disabled={props.locked || uploads.uploading() || props.references.length >= maxReferences()}
          onClick={() => fileInput?.click()}
        />

        {/* One chip: the model leads, and the sheet holds every choice. */}
        <button
          type="button"
          class={CHIP}
          disabled={props.locked}
          aria-haspopup="dialog"
          aria-label={`${t("images.options")}: ${(clip() ? clipModel()?.name : model()?.name) ?? ""}, ${summary()}`}
          onClick={() => setSheet(true)}
        >
          <IconSliders class="size-4 shrink-0 text-label-2" />
          <span class="truncate">
            {clip() ? clipModel()?.name : model()?.name}
            <span class="text-label-2"> · {summary()}</span>
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
          <div class="overflow-y-auto px-4 pb-4">
            <Show
              when={clip()}
              fallback={
                <Show when={model()}>
                  {(m) => (
                    <StudioOptions
                      config={props.config}
                      model={m()}
                      settings={props.settings}
                      onSettings={props.onSettings}
                      onPickModel={pick}
                      cost={props.cost}
                      extra={<CharacterOptions max={props.config.maxCharacters} onCreate={() => setSheet(false)} />}
                    />
                  )}
                </Show>
              }
            >
              <Show when={props.videoConfig}>
                {(cfg) => (
                  <Show when={clipModel()}>
                    {(m) => (
                      <VideoStudioOptions
                        config={cfg()}
                        model={m()}
                        settings={props.video}
                        onSettings={props.onVideo}
                        onPickModel={pickClip}
                        cost={props.cost}
                        balance={props.config.credits}
                      />
                    )}
                  </Show>
                )}
              </Show>
            </Show>
          </div>
        </Sheet>

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
            aria-label={
              clip() ? t("video.generateFor", { n: props.cost ?? 0 }) : t("images.generateFor", { n: props.cost ?? 0 })
            }
          >
            <span class="hidden sm:inline">
              {clip()
                ? t("video.generateCost", { n: props.cost ?? "–" })
                : t("images.generateCost", { n: props.cost ?? "–" })}
            </span>
            <span class="sm:hidden">{props.cost ?? "–"}</span>
          </Button>
        </Show>
      </div>
    </form>
  )
}
