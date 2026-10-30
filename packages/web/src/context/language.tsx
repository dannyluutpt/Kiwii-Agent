import { createSignal } from "solid-js"
import { createSimpleContext } from "@kiwii/ui/context/helper"
import { BRAND } from "@/brand"
import { dict as en } from "@/i18n/en"
import { dict as vi, type I18nKey } from "@/i18n/vi"

export type Locale = "vi" | "en"
const STORAGE_KEY = "kiwii-locale"
const dicts: Record<Locale, Record<I18nKey, string>> = { vi, en }

function initialLocale(): Locale {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "vi" || stored === "en") return stored
  } catch {}
  return navigator.language?.toLowerCase().startsWith("en") ? "en" : "vi"
}

export const { use: useLanguage, provider: LanguageProvider } = createSimpleContext({
  name: "Language",
  init: () => {
    const [locale, setLocale] = createSignal<Locale>(initialLocale())
    // The page says which language it is in from the start, so screen readers and translators know.
    document.documentElement.lang = locale()
    return {
      locale,
      setLocale: (next: Locale) => {
        setLocale(next)
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {}
        document.documentElement.lang = next
      },
      // {{brand}} is always the product name; other placeholders come from `params`.
      t: (key: I18nKey, params?: Record<string, string | number>) => {
        const values: Record<string, string | number> = { brand: BRAND, ...params }
        return dicts[locale()][key].replace(/{{\s*(\w+)\s*}}/g, (_, name: string) => String(values[name] ?? ""))
      },
    }
  },
})
