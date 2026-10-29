import { A } from "@solidjs/router"
import { For, type ParentProps } from "solid-js"
import { useLanguage } from "@/context/language"
import type { I18nKey } from "@/i18n/vi"
import { buttonClass } from "@/ui/button"

const NAV: Array<{ href: string; label: I18nKey }> = [
  { href: "/#tinh-nang", label: "site.nav.features" },
  { href: "/#sua-anh", label: "site.nav.edit" },
  { href: "/#anh-mau", label: "site.nav.gallery" },
  { href: "/pricing", label: "site.nav.pricing" },
]

// The public website around a page: a glass header that stays on top, the page, and the footer.
// The page scrolls inside it, as the app's screens do.
export function SitePage(props: ParentProps) {
  return (
    <div
      data-scroller
      class="h-full overflow-x-clip overflow-y-auto overscroll-contain bg-ambient motion-safe:scroll-smooth"
    >
      <SiteHeader />
      <main id="main">{props.children}</main>
      <SiteFooter />
    </div>
  )
}

function SiteHeader() {
  const { t } = useLanguage()
  return (
    <header class="glass sticky top-0 z-(--z-topbar) pt-safe shadow-[inset_0_-0.5px_0_var(--k-separator-strong)]">
      <div class="mx-auto flex h-16 w-full max-w-6xl items-center gap-2 px-4 md:px-6">
        <A href="/" class="flex shrink-0 items-center gap-2 rounded-[10px] py-1 pr-1.5">
          <img src="/logo.svg" alt="" class="size-8 rounded-[9px] shadow-[0_0_18px_-2px_rgb(255_214_10/0.6)]" />
          <span class="text-headline text-label">{t("app.name")}</span>
        </A>
        <nav aria-label={t("site.nav.label")} class="ml-6 hidden items-center gap-1 lg:flex">
          <For each={NAV}>
            {(item) => (
              <A
                href={item.href}
                class="rounded-full px-3 py-1.5 text-subhead font-medium text-label-2 transition-colors duration-(--motion-micro) hover:text-label"
              >
                {t(item.label)}
              </A>
            )}
          </For>
        </nav>
        <span class="flex-1" />
        <A href="/login" class={buttonClass("ghost", "sm")}>
          {t("site.signin")}
        </A>
        <A href="/signup" class={buttonClass("primary", "sm", undefined, true)}>
          <span class="max-sm:hidden">{t("site.start")}</span>
          <span class="sm:hidden">{t("site.startShort")}</span>
        </A>
      </div>
    </header>
  )
}

function SiteFooter() {
  const { t } = useLanguage()
  return (
    <footer class="border-t border-separator pb-safe">
      <div class="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 md:grid-cols-[1.5fr_1fr_1fr] md:px-6">
        <div class="flex flex-col gap-3">
          <A href="/" class="flex items-center gap-2 self-start">
            <img src="/logo.svg" alt="" class="size-8 rounded-[9px]" />
            <span class="text-headline text-label">{t("app.name")}</span>
          </A>
          <p class="max-w-xs text-subhead text-label-2">{t("site.footer.tagline")}</p>
        </div>
        <nav aria-label={t("site.footer.product")} class="flex flex-col gap-2 text-subhead">
          <h2 class="text-footnote font-semibold text-label-3">{t("site.footer.product")}</h2>
          <For each={NAV}>
            {(item) => (
              <A href={item.href} class="text-label-2 hover:text-label">
                {t(item.label)}
              </A>
            )}
          </For>
        </nav>
        <nav aria-label={t("site.footer.account")} class="flex flex-col gap-2 text-subhead">
          <h2 class="text-footnote font-semibold text-label-3">{t("site.footer.account")}</h2>
          <A href="/signup" class="text-label-2 hover:text-label">
            {t("site.start")}
          </A>
          <A href="/login" class="text-label-2 hover:text-label">
            {t("site.signin")}
          </A>
        </nav>
      </div>
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 pb-8 text-footnote text-label-3 md:flex-row md:justify-between md:px-6">
        <p>{t("site.footer.rights", { year: new Date().getFullYear() })}</p>
        <p>{t("site.footer.credit")}</p>
      </div>
    </footer>
  )
}
