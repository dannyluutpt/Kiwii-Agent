import { useLanguage } from "@/context/language"

export default function Images() {
  const { t } = useLanguage()
  return (
    <div class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
      <h1 class="text-20-medium text-text-strong">{t("images.soon.title")}</h1>
      <p class="max-w-md text-14-regular text-text-weak">{t("images.soon.lead")}</p>
    </div>
  )
}
