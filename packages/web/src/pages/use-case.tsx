import { A, useLocation } from "@solidjs/router"
import { createEffect, For, Show } from "solid-js"
import { BRAND } from "@/brand"
import { IconArrowRight, IconImage, IconVideo } from "@/components/icons"
import { SitePage } from "@/components/site"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { CLIPS, MODEL_NAMES, sample, sampleSrc, sampleSrcset } from "@/showcase"
import { templateExample, TEMPLATES } from "@/templates"
import { buttonClass } from "@/ui/button"
import { USE_CASES, useCase } from "@/use-cases"

// A public page for one thing people come to make (product photos, posters, fashion, food, video):
// what it is, the templates that make it, pictures and clips of that kind from the showcase with the
// prompts that made them, and the questions people ask. Everything on it leads to signing up and
// landing on the templates.
export default function UseCasePage() {
  const location = useLocation()
  const auth = useAuth()
  const { t, locale } = useLanguage()
  const page = () => useCase(location.pathname) ?? USE_CASES[0]!
  // Signed in, the templates open at once; otherwise sign-up leads there.
  const start = () => (auth.me() ? "/templates" : `/signup?next=${encodeURIComponent("/templates")}`)
  createEffect(() => {
    document.title = `${page().title[locale()]} · ${BRAND}`
  })
  const templates = () => page().templates.flatMap((id) => TEMPLATES.filter((template) => template.id === id))
  const clips = () => (page().clips ?? []).flatMap((key) => CLIPS.filter((clip) => clip.key === key))

  return (
    <SitePage>
      <header class="mx-auto flex w-full max-w-3xl flex-col items-center gap-5 px-4 pt-14 pb-10 text-center md:px-6 md:pt-20">
        <h1 class="text-[2.5rem] leading-[1.1] font-bold tracking-[-0.025em] text-balance text-label md:text-[3.25rem]">
          {page().title[locale()]}
        </h1>
        <p class="text-body text-label-2 md:text-[1.125rem]">{page().lead[locale()]}</p>
        <A href={start()} class={buttonClass("primary", "lg", "px-7", true)}>
          {t("landing.cta")}
          <IconArrowRight class="size-[18px]" weight={2.25} />
        </A>
        <p class="text-footnote text-label-3">{t("landing.trial")}</p>
      </header>

      <section class="mx-auto w-full max-w-6xl px-4 py-10 md:px-6" aria-labelledby="use-templates">
        <h2 id="use-templates" class="mb-5 text-title-2 text-label">
          {t("usecase.templates")}
        </h2>
        <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <For each={templates()}>
            {(template) => (
              <li>
                <A
                  href={start()}
                  class="flex h-full items-start gap-3 rounded-card bg-surface bg-sheen p-4 shadow-raised transition-[background-color,box-shadow,translate] duration-(--motion-standard) ease-standard hover:-translate-y-0.5 hover:bg-surface-2 hover:shadow-lift"
                >
                  <img
                    src={templateExample(template)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    class="size-20 shrink-0 rounded-[12px] object-cover shadow-raised"
                  />
                  <span class="flex min-w-0 flex-col gap-1">
                    <span class="text-headline text-label">{template.title[locale()]}</span>
                    <span class="text-subhead text-label-2">{template.lead[locale()]}</span>
                  </span>
                </A>
              </li>
            )}
          </For>
        </ul>
      </section>

      <Show when={page().samples.length > 0}>
        <section class="mx-auto w-full max-w-6xl px-4 py-10 md:px-6" aria-labelledby="use-samples">
          <h2 id="use-samples" class="mb-2 text-title-2 text-label">
            {t("usecase.samples", { brand: BRAND })}
          </h2>
          <p class="mb-5 text-callout text-label-2">{t("usecase.samplesLead")}</p>
          <ul class="grid gap-4 md:grid-cols-3">
            <For each={page().samples.map((key) => sample(key))}>
              {(item) => (
                <li class="flex flex-col overflow-hidden rounded-card bg-surface shadow-raised">
                  <img
                    src={sampleSrc(item)}
                    srcset={sampleSrcset(item)}
                    sizes="(min-width: 768px) 33vw, 100vw"
                    alt={item.title[locale()]}
                    width={item.width}
                    height={item.height}
                    loading="lazy"
                    decoding="async"
                    class="aspect-[4/5] w-full object-cover"
                  />
                  <div class="flex flex-1 flex-col gap-1.5 p-4">
                    <h3 class="text-headline text-label">{item.title[locale()]}</h3>
                    <p class="line-clamp-5 text-footnote text-label-2">“{item.prompt}”</p>
                    <p class="mt-auto pt-2 text-caption text-label-3">{MODEL_NAMES[item.model]}</p>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <Show when={clips().length > 0}>
        <section class="mx-auto w-full max-w-6xl px-4 py-10 md:px-6" aria-labelledby="use-clips">
          <h2 id="use-clips" class="mb-5 text-title-2 text-label">
            {t("usecase.clips", { brand: BRAND })}
          </h2>
          <ul class="grid gap-4 md:grid-cols-3">
            <For each={clips()}>
              {(clip) => (
                <li class="flex flex-col overflow-hidden rounded-card bg-surface shadow-raised">
                  <video
                    src={`/showcase/clips/${clip.key}.mp4`}
                    poster={`/showcase/clips/${clip.key}.webp`}
                    preload="none"
                    controls
                    playsinline
                    class="aspect-video w-full bg-black object-cover"
                    aria-label={clip.title[locale()]}
                  />
                  <div class="flex flex-col gap-1 p-4">
                    <h3 class="text-headline text-label">{clip.title[locale()]}</h3>
                    <p class="text-footnote text-label-2">
                      {clip.made[locale()]} · {clip.model}
                    </p>
                  </div>
                </li>
              )}
            </For>
          </ul>
        </section>
      </Show>

      <section class="mx-auto w-full max-w-3xl px-4 py-10 md:px-6" aria-labelledby="use-faq">
        <h2 id="use-faq" class="mb-5 text-title-2 text-label">
          {t("usecase.faq")}
        </h2>
        <dl class="flex flex-col gap-3">
          <For each={page().faq}>
            {(item) => (
              <div class="rounded-card bg-surface p-5 shadow-raised">
                <dt class="text-headline text-label">{item.q[locale()]}</dt>
                <dd class="mt-2 text-callout text-label-2">{item.a[locale()]}</dd>
              </div>
            )}
          </For>
        </dl>
      </section>

      <nav class="mx-auto w-full max-w-6xl px-4 pt-6 pb-20 md:px-6" aria-label={t("usecase.more")}>
        <h2 class="mb-4 text-title-3 text-label">{t("usecase.more")}</h2>
        <ul class="flex flex-wrap gap-2">
          <For each={USE_CASES.filter((item) => item.path !== page().path)}>
            {(item) => (
              <li>
                <A href={item.path} class={buttonClass("secondary", "md")}>
                  {item.title[locale()]}
                </A>
              </li>
            )}
          </For>
        </ul>
      </nav>
    </SitePage>
  )
}
