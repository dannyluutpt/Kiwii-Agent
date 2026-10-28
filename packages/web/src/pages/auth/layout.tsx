import type { ParentProps } from "solid-js"
import { useLanguage } from "@/context/language"

// Scrolls on its own: the app root is fixed to the viewport, and on small phones the form plus the
// keyboard is taller than the screen.
export function AuthLayout(props: ParentProps) {
  const { t } = useLanguage()
  return (
    <div class="h-full overflow-y-auto overscroll-contain bg-canvas">
      <main class="flex min-h-full flex-col items-center justify-center px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div class="w-full max-w-[400px]">
          <div class="mb-6 flex items-center justify-center gap-2.5">
            <img src="/logo.png" alt="" class="size-10 rounded-[11px] shadow-raised" />
            <span class="text-title-2 text-label">{t("app.name")}</span>
          </div>
          <div class="rounded-panel bg-surface p-6 shadow-floating sm:p-8">{props.children}</div>
        </div>
      </main>
    </div>
  )
}
