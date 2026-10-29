import { For } from "solid-js"
import { useLanguage } from "@/context/language"
import type { I18nKey } from "@/i18n/vi"

export type Filter = "all" | "images" | "videos" | "characters"

const CHIPS: Array<{ value: Filter; label: I18nKey }> = [
  { value: "all", label: "filter.all" },
  { value: "images", label: "filter.images" },
  { value: "videos", label: "filter.videos" },
  { value: "characters", label: "filter.characters" },
]

// Pill toggles above the gallery: which kind of work it shows.
export function FilterChips(props: { value: Filter; onChange: (value: Filter) => void }) {
  const { t } = useLanguage()
  return (
    <div role="group" aria-label={t("filter.label")} class="flex shrink-0 gap-2 overflow-x-auto px-3 pt-1 md:px-5">
      <For each={CHIPS}>
        {(chip) => (
          <button
            type="button"
            aria-pressed={props.value === chip.value}
            class="flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-subhead font-medium transition-[background-color,color,box-shadow] duration-(--motion-micro) disabled:cursor-default aria-pressed:bg-accent-soft aria-pressed:bg-amber-soft-gloss aria-pressed:text-accent aria-pressed:shadow-selected not-aria-pressed:bg-fill not-aria-pressed:bg-gloss not-aria-pressed:text-label-2 not-aria-pressed:shadow-gloss not-aria-pressed:enabled:hover:bg-gloss-hover not-aria-pressed:enabled:hover:text-label"
            onClick={() => props.onChange(chip.value)}
          >
            {t(chip.label)}
          </button>
        )}
      </For>
    </div>
  )
}
