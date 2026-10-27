import type { ParentProps } from "solid-js"
import { useLanguage } from "@/context/language"

export function AuthLayout(props: ParentProps) {
  const { t } = useLanguage()
  return (
    <div class="flex min-h-dvh items-center justify-center bg-background-base p-6">
      <div class="w-full max-w-sm">
        <div class="mb-6 flex items-center justify-center gap-2.5">
          <img src="/logo.png" alt="" class="size-9 rounded-lg" />
          <span class="text-20-medium text-text-strong">{t("app.name")}</span>
        </div>
        <div class="rounded-2xl border border-border-weak-base bg-surface-raised-base p-6">{props.children}</div>
      </div>
    </div>
  )
}
