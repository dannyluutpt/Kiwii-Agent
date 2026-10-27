import { useLanguage } from "@/context/language"

export default function Pricing() {
  const { t } = useLanguage()
  return (
    <div class="flex flex-1 items-center justify-center p-6 text-center">
      <p class="text-14-regular text-text-weak">{t("pricing.soon")}</p>
    </div>
  )
}
