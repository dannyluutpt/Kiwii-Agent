import { useLanguage, type Locale } from "@/context/language"
import { buttonClass } from "@/ui/button"
import { Menu, MenuContent, MenuRadioGroup } from "@/ui/menu"
import { IconGlobe } from "./icons"

// Each language is named in itself, so a visitor who cannot read the current one still finds theirs.
const LANGUAGES: Array<{ value: Locale; label: string }> = [
  { value: "vi", label: "Tiếng Việt" },
  { value: "en", label: "English" },
]

// The language picker of the public website and the sign-in screens: a globe with the current
// language's code, opening both languages. Signed in, the account screen has its own.
export function LanguageSwitch() {
  const { t, locale, setLocale } = useLanguage()
  const current = () => LANGUAGES.find((language) => language.value === locale())?.label ?? ""
  return (
    <Menu placement="bottom-end" gutter={6}>
      {/* A phone's header has room for the globe alone. */}
      <Menu.Trigger
        aria-label={t("language.current", { name: current() })}
        class={buttonClass("ghost", "sm", "max-sm:w-8 max-sm:px-0")}
      >
        <IconGlobe class="size-[18px]" />
        <span aria-hidden="true" class="max-sm:hidden">
          {locale().toUpperCase()}
        </span>
      </Menu.Trigger>
      <MenuContent class="min-w-[180px]">
        <MenuRadioGroup
          label={t("language.label")}
          value={locale()}
          onChange={setLocale}
          options={LANGUAGES}
          closeOnSelect
        />
      </MenuContent>
    </Menu>
  )
}
