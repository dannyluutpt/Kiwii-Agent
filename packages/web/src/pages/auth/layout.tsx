import { A } from "@solidjs/router"
import type { ParentProps } from "solid-js"
import { LanguageSwitch } from "@/components/language-switch"
import { useLanguage } from "@/context/language"

// Scrolls on its own: the app root is fixed to the viewport, and on small phones the form plus the
// keyboard is taller than the screen.
export function AuthLayout(props: ParentProps) {
  const { t } = useLanguage()
  return (
    <div class="relative h-full overflow-y-auto overscroll-contain bg-ambient">
      <div class="absolute top-[max(0.75rem,env(safe-area-inset-top))] right-3 z-10">
        <LanguageSwitch />
      </div>
      <main class="flex min-h-full flex-col items-center justify-center px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div class="w-full max-w-[400px]">
          {/* Back to the website. */}
          <A href="/" class="mx-auto mb-6 flex w-fit items-center justify-center gap-2.5 rounded-[12px]">
            <img src="/logo.svg" alt="" class="size-10 rounded-[11px] shadow-glow" />
            <span class="text-title-2 text-label">{t("app.name")}</span>
          </A>
          <div class="rounded-panel bg-surface bg-sheen p-6 shadow-[var(--k-shadow-floating),0_-12px_60px_-30px_rgb(255_214_10/0.35)] sm:p-8">
            {props.children}
          </div>
        </div>
      </main>
    </div>
  )
}
