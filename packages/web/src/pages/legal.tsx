import { useLocation } from "@solidjs/router"
import { createEffect, For } from "solid-js"
import { BRAND } from "@/brand"
import { SitePage } from "@/components/site"
import { useLanguage } from "@/context/language"
import { LEGAL, type LegalID } from "@/legal"

// The terms, the privacy policy or the refund policy, by the page's address. Public: anyone reads them
// before signing up, and a signed-in customer reaches them from the same links.
export default function Legal() {
  const location = useLocation()
  const { t, locale } = useLanguage()
  const doc = () => LEGAL[location.pathname.slice(1) as LegalID][locale()]
  createEffect(() => {
    document.title = `${doc().title} · ${BRAND}`
  })
  return (
    <SitePage>
      <article class="mx-auto w-full max-w-2xl px-4 pt-10 pb-16 md:px-6 md:pt-16">
        <header class="mb-8 flex flex-col gap-2">
          <h1 class="text-large-title text-label">{doc().title}</h1>
          <p class="text-footnote text-label-3">{t("legal.updated", { date: doc().updated })}</p>
          <p class="mt-2 text-body text-label-2">{doc().intro}</p>
        </header>
        <For each={doc().sections}>
          {(section) => (
            <section class="mb-7">
              <h2 class="mb-2 text-title-3 text-label">{section.heading}</h2>
              <For each={section.body}>{(text) => <p class="mb-3 text-callout text-label-2">{text}</p>}</For>
            </section>
          )}
        </For>
      </article>
    </SitePage>
  )
}
