import { RadioGroup } from "@kobalte/core/radio-group"
import { For, Show, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import type { ImageModel, ModelsResponse, StudioSettings } from "@/images"
import { Segmented } from "@/ui/segmented"
import { AspectIcon } from "./aspect-icon"
import { IconCheck } from "./icons"

type OptionProps = {
  config: ModelsResponse
  model: ImageModel
  settings: StudioSettings
  onSettings: (patch: Partial<StudioSettings>) => void
}

// Everything about a run except the prompt, in one column: the phone's bottom sheet, which also
// lists the models (`onPickModel`). The assistant's composer shows each part in its own popover.
export function StudioOptions(
  props: OptionProps & {
    onPickModel?: (model: ImageModel) => void
    cost: number | undefined
    // More choices that change the price, shown above it.
    extra?: JSX.Element
  },
) {
  const { t, locale } = useLanguage()
  const number = (n: number) => n.toLocaleString(locale() === "vi" ? "vi-VN" : "en-US")
  return (
    <div class="flex flex-col gap-5">
      <Show when={props.onPickModel && props.config.models.length > 1}>
        <ModelOptions {...props} onPickModel={(model) => props.onPickModel?.(model)} />
      </Show>
      <QualityOptions {...props} />
      <AspectOptions {...props} />
      <CountOptions {...props} />
      {props.extra}
      <p class="border-t border-separator pt-3 text-footnote text-label-2" aria-live="polite">
        {props.cost === undefined
          ? t("images.costUnknown")
          : t("images.costLine", { n: number(props.cost), balance: number(props.config.credits) })}
      </p>
    </div>
  )
}

export function ModelOptions(props: OptionProps & { onPickModel: (model: ImageModel) => void }) {
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

// The models to make a run with, each by name and what it does best.
export function ModelPicker(props: {
  models: Array<{ id: string; name: string; tagline: string }>
  value: string
  onPick: (id: string) => void
}) {
  const { t } = useLanguage()
  return (
    <RadioGroup value={props.value} onChange={props.onPick} class="flex flex-col gap-2">
      <RadioGroup.Label class="text-footnote font-semibold text-label-2">{t("images.model")}</RadioGroup.Label>
      <div class="divide-y divide-separator overflow-hidden rounded-[14px] bg-fill bg-sheen shadow-gloss">
        <For each={props.models}>
          {(m) => (
            <RadioGroup.Item
              value={m.id}
              class="has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-focus"
            >
              <RadioGroup.ItemInput />
              <RadioGroup.ItemLabel class="flex min-h-14 cursor-pointer select-none items-center gap-3 px-3.5 py-2.5 transition-[background-color] duration-(--motion-micro) active:bg-fill-2">
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="text-callout font-medium text-label">{m.name}</span>
                  <span class="text-footnote text-label-2">{m.tagline}</span>
                </span>
                <RadioGroup.ItemIndicator class="text-accent drop-shadow-[0_0_6px_rgb(255_214_10/0.7)]">
                  <IconCheck class="size-5" weight={2.25} />
                </RadioGroup.ItemIndicator>
              </RadioGroup.ItemLabel>
            </RadioGroup.Item>
          )}
        </For>
      </div>
    </RadioGroup>
  )
}

export function QualityOptions(props: OptionProps) {
  const { t } = useLanguage()
  return (
    <PriceTiles
      label={props.model.param === "resolution" ? t("images.resolution") : t("images.quality")}
      value={props.settings.option}
      onChange={(option) => props.onSettings({ option })}
      options={props.model.options}
    />
  )
}

// One tile per option with what it costs: two or four sit in pairs, other counts in rows of three,
// so every name and price stays readable however many options a model has.
export function PriceTiles(props: {
  label: string
  value: string
  onChange: (id: string) => void
  options: Array<{ id: string; label: string; credits: number | undefined }>
}) {
  const { t } = useLanguage()
  return (
    <RadioGroup value={props.value} onChange={props.onChange} class="flex flex-col gap-2">
      <RadioGroup.Label class="text-footnote font-semibold text-label-2">{props.label}</RadioGroup.Label>
      <div class={`grid gap-2 ${[1, 2, 4].includes(props.options.length) ? "grid-cols-2" : "grid-cols-3"}`}>
        <For each={props.options}>
          {(option) => (
            <RadioGroup.Item
              value={option.id}
              class="rounded-[12px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
            >
              <RadioGroup.ItemInput />
              <RadioGroup.ItemLabel class="flex h-14 cursor-pointer select-none flex-col items-center justify-center rounded-[12px] bg-fill bg-gloss px-2 text-center text-label-2 shadow-gloss transition-[color,background-color,box-shadow] duration-(--motion-micro) hover:bg-gloss-hover data-[checked]:bg-accent-soft data-[checked]:bg-amber-soft-gloss data-[checked]:text-accent data-[checked]:shadow-selected">
                <span class="text-subhead font-medium">{option.label}</span>
                <Show when={option.credits !== undefined}>
                  <span class="text-caption opacity-80">{t("images.cost", { n: option.credits ?? 0 })}</span>
                </Show>
              </RadioGroup.ItemLabel>
            </RadioGroup.Item>
          )}
        </For>
      </div>
    </RadioGroup>
  )
}

export function AspectOptions(props: OptionProps) {
  return (
    <AspectPicker
      ratios={props.model.aspectRatios}
      value={props.settings.aspectRatio}
      onChange={(aspectRatio) => props.onSettings({ aspectRatio })}
    />
  )
}

export function AspectPicker(props: { ratios: string[]; value: string; onChange: (ratio: string) => void }) {
  const { t } = useLanguage()
  return (
    <RadioGroup value={props.value} onChange={props.onChange} class="flex flex-col gap-2">
      <RadioGroup.Label class="text-footnote font-semibold text-label-2">{t("images.aspect")}</RadioGroup.Label>
      <div class="grid grid-cols-4 gap-2">
        <For each={props.ratios}>
          {(ratio) => (
            <RadioGroup.Item
              value={ratio}
              class="rounded-[12px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
            >
              <RadioGroup.ItemInput />
              <RadioGroup.ItemLabel class="flex h-16 cursor-pointer select-none flex-col items-center justify-center gap-1 rounded-[12px] bg-fill bg-gloss text-footnote font-medium text-label-2 shadow-gloss transition-[color,background-color,box-shadow] duration-(--motion-micro) hover:bg-gloss-hover data-[checked]:bg-accent-soft data-[checked]:bg-amber-soft-gloss data-[checked]:text-accent data-[checked]:shadow-selected">
                <AspectIcon ratio={ratio} class="size-6" />
                {ratio}
              </RadioGroup.ItemLabel>
            </RadioGroup.Item>
          )}
        </For>
      </div>
    </RadioGroup>
  )
}

export function CountOptions(props: OptionProps) {
  const { t } = useLanguage()
  const counts = () => Array.from({ length: props.config.maxImages }, (_, i) => String(i + 1))
  return (
    <Section title={t("images.count")}>
      <Segmented
        block
        label={t("images.count")}
        value={String(props.settings.n)}
        onChange={(n) => props.onSettings({ n: Number(n) })}
        options={counts().map((n) => ({ value: n, label: n }))}
      />
    </Section>
  )
}

export function Section(props: { title: string; children: JSX.Element }) {
  return (
    <div class="flex flex-col gap-2">
      <p class="text-footnote font-semibold text-label-2" aria-hidden="true">
        {props.title}
      </p>
      {props.children}
    </div>
  )
}
