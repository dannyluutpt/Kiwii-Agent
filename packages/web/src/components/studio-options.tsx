import { RadioGroup } from "@kobalte/core/radio-group"
import { For, Show, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import type { ImageModel, ModelsResponse, StudioSettings } from "@/images"
import { Segmented } from "@/ui/segmented"
import { AspectIcon } from "./aspect-icon"
import { IconCheck } from "./icons"

// Everything about a run except the prompt: quality, frame and how many pictures. Shown in a popover
// on wide screens, where the model has its own menu, and in a bottom sheet on phones, which also
// lists the models (`onPickModel`).
export function StudioOptions(props: {
  config: ModelsResponse
  model: ImageModel
  settings: StudioSettings
  onSettings: (patch: Partial<StudioSettings>) => void
  onPickModel?: (model: ImageModel) => void
  cost: number | undefined
}) {
  const { t, locale } = useLanguage()
  const number = (n: number) => n.toLocaleString(locale() === "vi" ? "vi-VN" : "en-US")
  const counts = () => Array.from({ length: props.config.maxImages }, (_, i) => String(i + 1))

  return (
    <div class="flex flex-col gap-5">
      <Show when={props.onPickModel && props.config.models.length > 1}>
        <RadioGroup
          value={props.settings.model}
          onChange={(id) => {
            const next = props.config.models.find((m) => m.id === id)
            if (next) props.onPickModel?.(next)
          }}
          class="flex flex-col gap-2"
        >
          <RadioGroup.Label class="text-footnote font-semibold text-label-2">{t("images.model")}</RadioGroup.Label>
          <div class="divide-y divide-separator overflow-hidden rounded-[14px] bg-fill">
            <For each={props.config.models}>
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
                    <RadioGroup.ItemIndicator class="text-accent">
                      <IconCheck class="size-5" weight={2.25} />
                    </RadioGroup.ItemIndicator>
                  </RadioGroup.ItemLabel>
                </RadioGroup.Item>
              )}
            </For>
          </div>
        </RadioGroup>
      </Show>

      <RadioGroup
        value={props.settings.option}
        onChange={(option) => props.onSettings({ option })}
        class="flex flex-col gap-2"
      >
        <RadioGroup.Label class="text-footnote font-semibold text-label-2">
          {props.model.param === "resolution" ? t("images.resolution") : t("images.quality")}
        </RadioGroup.Label>
        {/* Tiles rather than one bar, so every name and price stays readable however many options a
            model has: two or four sit in pairs, other counts in rows of three. */}
        <div class={`grid gap-2 ${[2, 4].includes(props.model.options.length) ? "grid-cols-2" : "grid-cols-3"}`}>
          <For each={props.model.options}>
            {(option) => (
              <RadioGroup.Item
                value={option.id}
                class="rounded-[12px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
              >
                <RadioGroup.ItemInput />
                <RadioGroup.ItemLabel class="flex h-14 cursor-pointer select-none flex-col items-center justify-center rounded-[12px] bg-fill px-2 text-center text-label-2 transition-[color,background-color,box-shadow] duration-(--motion-micro) hover:bg-fill-2 data-[checked]:bg-accent-soft data-[checked]:text-accent data-[checked]:shadow-[inset_0_0_0_1.5px_var(--k-accent)]">
                  <span class="text-subhead font-medium">{option.label}</span>
                  <span class="text-caption opacity-80">{t("images.cost", { n: option.credits })}</span>
                </RadioGroup.ItemLabel>
              </RadioGroup.Item>
            )}
          </For>
        </div>
      </RadioGroup>

      <RadioGroup
        value={props.settings.aspectRatio}
        onChange={(aspectRatio) => props.onSettings({ aspectRatio })}
        class="flex flex-col gap-2"
      >
        <RadioGroup.Label class="text-footnote font-semibold text-label-2">{t("images.aspect")}</RadioGroup.Label>
        <div class="grid grid-cols-4 gap-2">
          <For each={props.model.aspectRatios}>
            {(ratio) => (
              <RadioGroup.Item
                value={ratio}
                class="rounded-[12px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus"
              >
                <RadioGroup.ItemInput />
                <RadioGroup.ItemLabel class="flex h-16 cursor-pointer select-none flex-col items-center justify-center gap-1 rounded-[12px] bg-fill text-footnote font-medium text-label-2 transition-[color,background-color,box-shadow] duration-(--motion-micro) hover:bg-fill-2 data-[checked]:bg-accent-soft data-[checked]:text-accent data-[checked]:shadow-[inset_0_0_0_1.5px_var(--k-accent)]">
                  <AspectIcon ratio={ratio} class="size-6" />
                  {ratio}
                </RadioGroup.ItemLabel>
              </RadioGroup.Item>
            )}
          </For>
        </div>
      </RadioGroup>

      <Section title={t("images.count")}>
        <Segmented
          block
          label={t("images.count")}
          value={String(props.settings.n)}
          onChange={(n) => props.onSettings({ n: Number(n) })}
          options={counts().map((n) => ({ value: n, label: n }))}
        />
      </Section>

      <p class="border-t border-separator pt-3 text-footnote text-label-2" aria-live="polite">
        {props.cost === undefined
          ? t("images.costUnknown")
          : t("images.costLine", { n: number(props.cost), balance: number(props.config.credits) })}
      </p>
    </div>
  )
}

function Section(props: { title: string; children: JSX.Element }) {
  return (
    <div class="flex flex-col gap-2">
      <p class="text-footnote font-semibold text-label-2" aria-hidden="true">
        {props.title}
      </p>
      {props.children}
    </div>
  )
}
