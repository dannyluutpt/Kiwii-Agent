import { SitePage } from "@/components/site"
import { useLanguage } from "@/context/language"
import { PricingPlans } from "./pricing"

// The prices on the public website, for visitors who are not signed in.
export default function SitePricing() {
  const { t } = useLanguage()
  return (
    <SitePage>
      <div class="mx-auto w-full max-w-6xl px-4 pt-10 pb-16 md:px-6 md:pt-16">
        <header class="mx-auto mb-10 flex max-w-2xl flex-col gap-3 text-center">
          <h1 class="text-[2.5rem] leading-[1.15] font-bold tracking-[-0.02em] text-balance text-label">
            {t("pricing.title")}
          </h1>
          <p class="text-callout text-label-2 md:text-body">{t("pricing.lead")}</p>
        </header>
        <PricingPlans />
      </div>
    </SitePage>
  )
}
