import { createSignal } from "solid-js"
import { createSimpleContext } from "@kiwii/ui/context/helper"
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
    return {
      locale,
      setLocale: (next: Locale) => {
        setLocale(next)
        try {
          localStorage.setItem(STORAGE_KEY, next)
        } catch {}
        document.documentElement.lang = next
      },
      t: (key: I18nKey, params?: Record<string, string | number>) => {
        const text = dicts[locale()][key]
        if (!params) return text
        return text.replace(/{{\s*(\w+)\s*}}/g, (_, name: string) => String(params[name] ?? ""))
      },
    }
  },
})
