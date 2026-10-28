import { A } from "@solidjs/router"
import { For, type JSX } from "solid-js"
import { useLanguage } from "@/context/language"
import type { I18nKey } from "@/i18n/vi"
import { IconChat, IconImage, IconLibrary, IconPerson } from "./icons"

const TABS: Array<{ href: string; end?: boolean; label: I18nKey; icon: () => JSX.Element }> = [
  { href: "/chat", label: "tab.chat", icon: () => <IconChat class="size-6" weight={1.6} /> },
  { href: "/images", end: true, label: "tab.images", icon: () => <IconImage class="size-6" weight={1.6} /> },
  { href: "/images/assets", label: "tab.library", icon: () => <IconLibrary class="size-6" weight={1.6} /> },
  { href: "/account", label: "tab.account", icon: () => <IconPerson class="size-6" weight={1.6} /> },
]

// Phone navigation: four destinations a thumb can always reach. It floats over the content (which
// pads itself by --tabbar-space) and hides while the keyboard is up.
export function TabBar() {
  const { t } = useLanguage()
  return (
    <nav
      aria-label={t("nav.primary")}
      data-keyboard-hide
      class="glass absolute inset-x-0 bottom-0 z-(--z-tabbar) shadow-[inset_0_0.5px_0_var(--k-separator-strong)] pb-safe"
    >
      <ul class="mx-auto flex h-(--tabbar-height) max-w-lg">
        <For each={TABS}>
          {(tab) => (
            <li class="flex-1">
              <A
                href={tab.href}
                end={tab.end}
                class="flex h-full flex-col items-center justify-center gap-0.5 pt-1 text-caption-2 font-medium transition-[color,background-color] duration-(--motion-micro)"
                activeClass="text-accent"
                inactiveClass="text-label-2 active:text-label"
              >
                {tab.icon()}
                {t(tab.label)}
              </A>
            </li>
          )}
        </For>
      </ul>
    </nav>
  )
}
