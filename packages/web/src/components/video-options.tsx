import { Show, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import type { StudioMode, VideoModel, VideoModelsResponse, VideoSettings } from "@/images"
import { Segmented } from "@/ui/segmented"
import { IconImage, IconVideo } from "./icons"
import { AspectPicker, ModelPicker, PriceTiles, Section } from "./studio-options"

type VideoOptionProps = {
  config: VideoModelsResponse
  model: VideoModel
  settings: VideoSettings
  onSettings: (patch: Partial<VideoSettings>) => void
}

// What the composer makes: pictures, or a clip.
export function ModeSwitch(props: { value: StudioMode; onChange: (mode: StudioMode) => void; class?: string }) {
  const { t } = useLanguage()
  return (
    <Segmented
      label={t("studio.mode")}
      value={props.value}
      onChange={props.onChange}
      class={props.class}
      options={[
        { value: "image", label: t("studio.mode.image"), icon: <IconImage class="size-4" /> },
        { value: "video", label: t("studio.mode.video"), icon: <IconVideo class="size-4" /> },
      ]}
    />
  )
}

// Everything about a clip except the prompt, in one column: the phone's bottom sheet.
export function VideoStudioOptions(
  props: VideoOptionProps & {
    onPickModel: (model: VideoModel) => void
    cost: number | undefined
    balance: number
    // The characters and the location of the clip, shown above its price.
    extra?: JSX.Element
  },
) {
  const { t, locale } = useLanguage()
  const number = (n: number) => n.toLocaleString(locale() === "vi" ? "vi-VN" : "en-US")
  return (
    <div class="flex flex-col gap-5">
      <Show when={props.config.models.length > 1}>
        <VideoModelOptions {...props} />
      </Show>
      <VideoResolutionOptions {...props} />
      <DurationOptions {...props} />
      <VideoAspectOptions {...props} />
      {props.extra}
      <p class="border-t border-separator pt-3 text-footnote text-label-2" aria-live="polite">
        {props.cost === undefined
          ? t("images.costUnknown")
          : t("images.costLine", { n: number(props.cost), balance: number(props.balance) })}
      </p>
    </div>
  )
}

export function VideoModelOptions(props: VideoOptionProps & { onPickModel: (model: VideoModel) => void }) {
  return (
    <ModelPicker
      models={props.config.models}
      value={props.settings.model}
      onPick={(id) => {
        const next = props.config.models.find((m) => m.id === id)
        if (next) props.onPickModel(next)
      }}
    />
  )
}

// Each resolution priced for the clip's length.
export function VideoResolutionOptions(props: VideoOptionProps) {
  const { t } = useLanguage()
  return (
    <PriceTiles
      label={t("images.resolution")}
      value={props.settings.option}
      onChange={(option) => props.onSettings({ option })}
      options={props.model.options.map((option) => ({
        id: option.id,
        label: option.label,
        credits: option.credits[String(props.settings.duration)],
      }))}
    />
  )
}

export function DurationOptions(props: VideoOptionProps) {
  const { t } = useLanguage()
  return (
    <Section title={t("video.duration")}>
      <Segmented
        block
        label={t("video.duration")}
        value={String(props.settings.duration)}
        onChange={(seconds) => props.onSettings({ duration: Number(seconds) })}
        options={props.model.durations.map((seconds) => ({
          value: String(seconds),
          label: t("video.seconds", { n: seconds }),
        }))}
      />
    </Section>
  )
}

export function VideoAspectOptions(props: VideoOptionProps) {
  return (
    <AspectPicker
      ratios={props.model.aspectRatios}
      value={props.settings.aspectRatio}
      onChange={(aspectRatio) => props.onSettings({ aspectRatio })}
    />
  )
}

// Another clip model, keeping every setting it also offers.
export function fitVideoModel(next: VideoModel, settings: VideoSettings): Partial<VideoSettings> {
  return {
    model: next.id,
    option: next.options.some((o) => o.id === settings.option) ? settings.option : (next.options[0]?.id ?? ""),
    aspectRatio: next.aspectRatios.includes(settings.aspectRatio)
      ? settings.aspectRatio
      : (next.aspectRatios[0] ?? "16:9"),
    duration: next.durations.includes(settings.duration) ? settings.duration : (next.durations[0] ?? 5),
  }
}
