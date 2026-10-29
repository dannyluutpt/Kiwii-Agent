import { A } from "@solidjs/router"
import { createResource, For, Show, type JSX } from "solid-js"
import { api } from "@/api"
import { vnd, type PlanInfo, type Topup, type Trial } from "@/billing"
import { Compare } from "@/components/compare"
import {
  IconArrowRight,
  IconArrowUp,
  IconChat,
  IconCheck,
  IconChevronDown,
  IconPerson,
  IconPlay,
  IconWand,
} from "@/components/icons"
import { SitePage } from "@/components/site"
import { useLanguage } from "@/context/language"
import type { I18nKey } from "@/i18n/vi"
import { MODEL_NAMES, sample, sampleSrc, sampleSrcset, type Sample } from "@/showcase"
import { buttonClass } from "@/ui/button"
import { Tag } from "@/ui/tag"

const HERO = [
  ["ao-dai", "nuoc-hoa"],
  ["ca-phe", "song-hoai", "linh-vat"],
  ["thanh-pho-may", "pho"],
]

const FEATURES: Array<{ key: string; icon: () => JSX.Element; title: I18nKey; lead: I18nKey; soon?: boolean }> = [
  {
    key: "meo",
    icon: () => <IconChat class="size-5" />,
    title: "landing.features.assistant.title",
    lead: "landing.features.assistant.lead",
  },
  {
    key: "louvre",
    icon: () => <IconWand class="size-5" />,
    title: "landing.features.edit.title",
    lead: "landing.features.edit.lead",
  },
  {
    key: "linh-vat",
    icon: () => <IconPerson class="size-5" />,
    title: "landing.features.characters.title",
    lead: "landing.features.characters.lead",
    soon: true,
  },
  {
    key: "ha-long",
    icon: () => <IconPlay class="size-5" />,
    title: "landing.features.video.title",
    lead: "landing.features.video.lead",
    soon: true,
  },
]

const MODELS: Array<{ key: string; model: Sample["model"]; lead: I18nKey; points: I18nKey[] }> = [
  {
    key: "poster",
    model: "gpt-image-2.5",
    lead: "landing.models.gpt.lead",
    points: ["landing.models.gpt.point1", "landing.models.gpt.point2"],
  },
  {
    key: "meo-mua",
    model: "nano-banana-2.1",
    lead: "landing.models.nano.lead",
    points: ["landing.models.nano.point1", "landing.models.nano.point2"],
  },
  {
    key: "thanh-pho-may",
    model: "flux-3-klein",
    lead: "landing.models.flux.lead",
    points: ["landing.models.flux.point1", "landing.models.flux.point2"],
  },
]

const GALLERY = [
  "ao-dai",
  "bac-thang",
  "thuong-hieu",
  "ca-phe",
  "noi-that",
  "banh-mi",
  "poster",
  "da-lat",
  "nuoc-hoa",
  "song-hoai",
  "pho",
  "linh-vat",
]

const EDITS: Array<{ key: string; place: I18nKey }> = [
  { key: "pho-krakow", place: "landing.edit.street" },
  { key: "louvre", place: "landing.edit.louvre" },
]

const FAQ: Array<{ q: I18nKey; a: I18nKey }> = [
  { q: "landing.faq.what.q", a: "landing.faq.what.a" },
  { q: "landing.faq.free.q", a: "landing.faq.free.a" },
  { q: "landing.faq.prompt.q", a: "landing.faq.prompt.a" },
  { q: "landing.faq.private.q", a: "landing.faq.private.a" },
  { q: "pricing.faq.pay.q", a: "pricing.faq.pay.a" },
]

// After signing up, the studio opens with this sample's words and model, ready to make it.
const tryPath = (s: Sample) =>
  `/signup?next=${encodeURIComponent(`/?prompt=${encodeURIComponent(s.prompt)}&model=${s.model}`)}`

// The public home page, for visitors who are not signed in: what Amberpix makes, how the assistant
// works, edits to compare, the models, pictures made with it, prices and questions. Every picture
// here was made with Amberpix (src/showcase.ts).
export default function Landing() {
  const { t, locale } = useLanguage()
  const [prices] = createResource(() => api<{ plans: PlanInfo[]; topups: Topup[]; trial: Trial }>("/billing/plans"))

  return (
    <SitePage>
      {/* Hero */}
      <section class="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-4 pt-12 pb-16 md:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-20 lg:pb-24">
        <div class="flex flex-col items-start gap-6">
          <Tag tone="accent" class="h-7 gap-1.5 px-3">
            <IconChat class="size-3.5" />
            {t("landing.badge")}
          </Tag>
          <h1 class="text-[2.5rem] leading-[1.08] font-bold tracking-[-0.03em] text-balance text-label md:text-[3.5rem]">
            {t("landing.title.start")}{" "}
            <span class="text-accent [text-shadow:0_0_32px_rgb(255_214_10/0.45)]">{t("landing.title.accent")}</span>
          </h1>
          <p class="max-w-xl text-body text-label-2 md:text-[1.125rem] md:leading-7">{t("landing.lead")}</p>
          <div class="flex flex-wrap gap-3">
            <A href="/signup" class={buttonClass("primary", "lg", "px-6", true)}>
              {t("landing.cta")}
              <IconArrowRight class="size-[18px]" weight={2.25} />
            </A>
            <A href="/pricing" class={buttonClass("secondary", "lg", "px-6", true)}>
              {t("landing.ctaPricing")}
            </A>
          </div>
          <Show when={prices()?.trial.credits}>
            <p class="flex items-center gap-2 text-footnote text-label-2">
              <IconCheck class="size-4 text-accent" weight={2.25} />
              {t("landing.trial", { credits: prices()?.trial.credits ?? 0, days: prices()?.trial.days ?? 0 })}
            </p>
          </Show>
        </div>

        <div class="relative" aria-hidden="true">
          <div class="pointer-events-none absolute -inset-10 rounded-full bg-[radial-gradient(closest-side,rgb(255_200_0/0.22),transparent)] blur-[48px]" />
          <div class="relative grid grid-cols-3 gap-3 [transform:perspective(1800px)_rotateY(-14deg)_rotateX(8deg)_rotateZ(2deg)] md:gap-4">
            <For each={HERO}>
              {(column, index) => (
                <div class="flex flex-col gap-3 md:gap-4" classList={{ "mt-10": index() === 1, "mt-4": index() === 2 }}>
                  <For each={column}>
                    {(key) => (
                      <div class="rim relative overflow-hidden rounded-[18px] shadow-[0_18px_40px_-16px_rgb(0_0_0/0.9)]">
                        <Picture sample={sample(key)} sizes="(min-width: 1024px) 200px, 33vw" eager />
                      </div>
                    )}
                  </For>
                </div>
              )}
            </For>
          </div>
          <div class="glass-panel absolute -bottom-6 left-1/2 flex w-[min(92%,420px)] -translate-x-1/2 items-center gap-3 rounded-full py-2 pr-2 pl-5 shadow-[var(--k-shadow-floating),0_0_40px_-12px_rgb(255_214_10/0.5)]">
            <span class="min-w-0 flex-1 truncate text-subhead text-label">{t("landing.prompt.text")}</span>
            <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-gloss text-on-accent shadow-amber">
              <IconArrowUp class="size-[18px]" weight={2.25} />
            </span>
          </div>
        </div>
      </section>

      {/* What it does */}
      <Section id="tinh-nang" title={t("landing.features.title")} lead={t("landing.features.lead")}>
        <ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <For each={FEATURES}>
            {(feature) => (
              <li class="rim relative flex flex-col overflow-hidden rounded-card bg-surface bg-sheen shadow-raised">
                <div class="relative aspect-[4/3] overflow-hidden">
                  <Picture
                    sample={sample(feature.key)}
                    sizes="(min-width: 1024px) 270px, (min-width: 640px) 45vw, 92vw"
                    cover
                  />
                  <div class="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
                  <Show when={feature.soon}>
                    <span class="glass absolute top-3 right-3 rounded-full px-2.5 py-1 text-caption font-semibold text-accent">
                      {t("landing.soon")}
                    </span>
                  </Show>
                </div>
                <div class="flex flex-1 flex-col gap-1.5 p-5 pt-0">
                  <span class="relative z-10 -mt-5 mb-1 flex size-10 items-center justify-center rounded-[12px] bg-amber-gloss text-on-accent shadow-amber">
                    {feature.icon()}
                  </span>
                  <h3 class="text-headline text-label">{t(feature.title)}</h3>
                  <p class="text-subhead text-label-2">{t(feature.lead)}</p>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Section>

      {/* The assistant */}
      <section class="mx-auto grid w-full max-w-6xl items-center gap-10 px-4 py-16 md:px-6 lg:grid-cols-2 lg:py-24">
        <div class="flex min-w-0 flex-col gap-5">
          <h2 class="text-[2rem] leading-[1.15] font-bold tracking-[-0.02em] text-balance text-label">
            {t("landing.assistant.title")}
          </h2>
          <p class="text-body text-label-2">{t("landing.assistant.lead")}</p>
          <ul class="flex flex-col gap-3">
            <For
              each={["landing.assistant.point1", "landing.assistant.point2", "landing.assistant.point3"] as I18nKey[]}
            >
              {(point) => (
                <li class="flex items-start gap-3 text-callout text-label">
                  <span class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-soft bg-amber-soft-gloss text-accent shadow-tinted">
                    <IconCheck class="size-3.5" weight={2.5} />
                  </span>
                  {t(point)}
                </li>
              )}
            </For>
          </ul>
        </div>
        <figure class="glass-panel rim relative flex min-w-0 flex-col gap-4 rounded-panel p-4 shadow-[var(--k-shadow-floating),0_30px_80px_-30px_rgb(255_200_0/0.35)] md:p-5">
          <figcaption class="sr-only">{t("landing.assistant.example")}</figcaption>
          <Exchange ask={t("landing.assistant.ask1")} reply={t("landing.assistant.reply1")} sample={sample("meo")} />
          <Exchange
            ask={t("landing.assistant.ask2")}
            reply={t("landing.assistant.reply2")}
            sample={sample("meo-mua")}
          />
          <div
            class="flex items-center gap-3 rounded-[20px] bg-surface-2 bg-sheen py-2 pr-2 pl-4 shadow-raised"
            aria-hidden="true"
          >
            <span class="min-w-0 flex-1 truncate text-callout text-label-3">{t("images.placeholder")}</span>
            <span class="flex size-9 items-center justify-center rounded-full bg-amber-gloss text-on-accent shadow-amber">
              <IconArrowUp class="size-[18px]" weight={2.25} />
            </span>
          </div>
        </figure>
      </section>

      {/* Edits to compare */}
      <Section id="sua-anh" title={t("landing.edit.title")} lead={t("landing.edit.lead")}>
        <div class="grid gap-6 lg:grid-cols-2">
          <For each={EDITS}>
            {(edit) => (
              <figure class="flex flex-col gap-3">
                <Compare
                  before={`/showcase/${edit.key}-before.webp`}
                  after={sampleSrc(sample(edit.key))}
                  alt={t(edit.place)}
                  ratio={`${sample(edit.key).width} / ${sample(edit.key).height}`}
                />
                <figcaption class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-1">
                  <span class="text-callout font-semibold text-label">{t(edit.place)}</span>
                  <span class="text-subhead text-label-2">{t("landing.edit.prompt")}</span>
                </figcaption>
              </figure>
            )}
          </For>
        </div>
      </Section>

      {/* The models */}
      <Section title={t("landing.models.title")} lead={t("landing.models.lead")}>
        <ul class="grid gap-4 md:grid-cols-3">
          <For each={MODELS}>
            {(item) => (
              <li class="rim relative flex flex-col overflow-hidden rounded-card bg-surface bg-sheen shadow-raised">
                <div class="aspect-[4/3] overflow-hidden">
                  <Picture sample={sample(item.key)} sizes="(min-width: 768px) 360px, 92vw" cover />
                </div>
                <div class="flex flex-col gap-2 p-5">
                  <h3 class="text-title-3 text-label">{MODEL_NAMES[item.model]}</h3>
                  <p class="text-subhead text-label-2">{t(item.lead)}</p>
                  <ul class="mt-1 flex flex-col gap-1.5">
                    <For each={item.points}>
                      {(point) => (
                        <li class="flex items-start gap-2 text-subhead text-label">
                          <IconCheck class="mt-0.5 size-4 shrink-0 text-accent" weight={2.25} />
                          {t(point)}
                        </li>
                      )}
                    </For>
                  </ul>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Section>

      {/* Pictures made with it */}
      <Section id="anh-mau" title={t("landing.gallery.title")} lead={t("landing.gallery.lead")}>
        <ul class="columns-2 gap-3 md:columns-3 md:gap-4 lg:columns-4">
          <For each={GALLERY.map(sample)}>
            {(item) => (
              <li class="group/sample rim relative mb-3 break-inside-avoid overflow-hidden rounded-card bg-surface shadow-raised md:mb-4">
                <Picture sample={item} sizes="(min-width: 1024px) 270px, (min-width: 768px) 30vw, 46vw" />
                <div class="absolute inset-x-0 bottom-0 flex flex-col gap-2 bg-gradient-to-t from-black/85 via-black/50 to-transparent p-3 pt-10">
                  <p class="text-footnote font-semibold text-white">{item.title[locale()]}</p>
                  <p class="line-clamp-3 hidden text-caption text-white/75 group-hover/sample:block group-focus-within/sample:block">
                    {item.prompt}
                  </p>
                  <div class="flex items-center justify-between gap-2">
                    <span class="truncate text-caption-2 text-white/60">{MODEL_NAMES[item.model]}</span>
                    <A
                      href={tryPath(item)}
                      class="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-caption font-semibold text-white backdrop-blur-md transition-colors hover:bg-amber-gloss hover:text-on-accent"
                      aria-label={t("landing.gallery.useFor", { title: item.title[locale()] })}
                    >
                      {t("landing.gallery.use")}
                    </A>
                  </div>
                </div>
              </li>
            )}
          </For>
        </ul>
      </Section>

      {/* Video, coming */}
      <section class="mx-auto w-full max-w-6xl px-4 py-12 md:px-6">
        <div class="rim relative overflow-hidden rounded-panel shadow-[var(--k-shadow-raised),0_30px_80px_-30px_rgb(255_200_0/0.35)]">
          <Picture
            sample={sample("ha-long")}
            sizes="(min-width: 1152px) 1104px, 100vw"
            cover
            class="absolute inset-0 size-full"
          />
          <div class="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/10" />
          <div class="relative flex min-h-[340px] flex-col items-start justify-center gap-4 p-6 md:min-h-[420px] md:p-12">
            <Tag tone="accent">{t("landing.soon")}</Tag>
            <h2 class="max-w-lg text-[2rem] leading-[1.15] font-bold tracking-[-0.02em] text-white">
              {t("landing.video.title")}
            </h2>
            <p class="max-w-md text-callout text-white/80">{t("landing.video.lead")}</p>
          </div>
          <span
            class="absolute top-1/2 right-[12%] hidden size-20 -translate-y-1/2 items-center justify-center rounded-full bg-amber-gloss text-on-accent shadow-[var(--k-shadow-amber),0_0_60px_rgb(255_200_0/0.6)] md:flex"
            aria-hidden="true"
          >
            <IconPlay class="ml-1 size-8" weight={2} />
          </span>
        </div>
      </section>

      {/* Prices */}
      <Section title={t("landing.pricing.title")} lead={t("pricing.lead")}>
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy={prices.loading}>
          <For each={prices()?.plans}>
            {(plan) => (
              <div
                class={`rim relative flex flex-col gap-1 rounded-card bg-surface bg-sheen p-5 ${
                  plan.id === "plus"
                    ? "shadow-[var(--k-shadow-raised),0_0_0_1.5px_var(--k-accent),0_18px_48px_-14px_rgb(255_200_0/0.45)]"
                    : "shadow-raised"
                }`}
              >
                <span class="flex items-center justify-between gap-2 text-headline text-label">
                  {plan.name}
                  <Show when={plan.id === "plus"}>
                    <Tag tone="accent">{t("pricing.popular")}</Tag>
                  </Show>
                </span>
                <span class="text-title-2 text-label tabular-nums">
                  {vnd(plan.priceVnd)}
                  <span class="text-footnote font-normal text-label-2">{t("pricing.perMonth")}</span>
                </span>
                <span class="text-subhead text-label-2">
                  {plan.id === "free"
                    ? t("pricing.trial", { credits: prices()?.trial.credits ?? 0, days: prices()?.trial.days ?? 0 })
                    : t("pricing.credits", { credits: plan.credits.toLocaleString("vi-VN") })}
                </span>
              </div>
            )}
          </For>
        </div>
        <div class="mt-8 flex justify-center">
          <A href="/pricing" class={buttonClass("secondary", "lg", "px-6", true)}>
            {t("landing.pricing.more")}
            <IconArrowRight class="size-[18px]" weight={2.25} />
          </A>
        </div>
      </Section>

      {/* Questions */}
      <Section title={t("pricing.faq.title")}>
        <div class="mx-auto max-w-3xl overflow-hidden rounded-card bg-surface bg-sheen shadow-raised [&>*+*]:border-t [&>*+*]:border-separator">
          <For each={FAQ}>
            {(item) => (
              <details class="group">
                <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-callout font-medium text-label transition-[background-color] duration-(--motion-micro) hover:bg-fill [&::-webkit-details-marker]:hidden">
                  {t(item.q)}
                  <IconChevronDown class="size-4 shrink-0 text-label-3 transition-transform duration-(--motion-standard) group-open:rotate-180" />
                </summary>
                <p class="px-5 pb-5 text-subhead text-label-2">{t(item.a)}</p>
              </details>
            )}
          </For>
        </div>
      </Section>

      {/* Last call */}
      <section class="mx-auto w-full max-w-6xl px-4 pt-8 pb-20 md:px-6">
        <div class="rim relative flex flex-col items-center gap-5 overflow-hidden rounded-panel bg-surface bg-sheen px-6 py-14 text-center shadow-[var(--k-shadow-raised),0_30px_90px_-30px_rgb(255_200_0/0.4)]">
          <div class="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-48 w-2/3 rounded-full bg-[radial-gradient(closest-side,rgb(255_214_10/0.28),transparent)] blur-[48px]" />
          <h2 class="relative max-w-2xl text-[2rem] leading-[1.15] font-bold tracking-[-0.02em] text-balance text-label">
            {t("landing.final.title")}
          </h2>
          <A href="/signup" class={buttonClass("primary", "lg", "relative px-7", true)}>
            {t("landing.final.cta")}
            <IconArrowRight class="size-[18px]" weight={2.25} />
          </A>
        </div>
      </section>
    </SitePage>
  )
}

function Section(props: { id?: string; title: string; lead?: string; children: JSX.Element }) {
  return (
    <section id={props.id} class="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-12 md:px-6 lg:py-16">
      <header class="mx-auto mb-8 flex max-w-2xl flex-col gap-3 text-center md:mb-10">
        <h2 class="text-[2rem] leading-[1.15] font-bold tracking-[-0.02em] text-balance text-label">{props.title}</h2>
        <Show when={props.lead}>
          <p class="text-callout text-label-2 md:text-body">{props.lead}</p>
        </Show>
      </header>
      {props.children}
    </section>
  )
}

// A showcase picture at the size the layout gives it; `cover` fills a box of another shape.
function Picture(props: { sample: Sample; sizes: string; eager?: boolean; cover?: boolean; class?: string }) {
  const { locale } = useLanguage()
  return (
    <img
      src={sampleSrc(props.sample)}
      srcset={sampleSrcset(props.sample)}
      sizes={props.sizes}
      alt={props.sample.title[locale()]}
      width={props.sample.width}
      height={props.sample.height}
      loading={props.eager ? "eager" : "lazy"}
      decoding="async"
      class={`block ${props.cover ? "size-full object-cover" : "h-auto w-full"} ${props.class ?? ""}`}
    />
  )
}

// One turn of the example conversation: the visitor's words and the assistant's picture.
function Exchange(props: { ask: string; reply: string; sample: Sample }) {
  return (
    <>
      <p class="ml-auto max-w-[85%] rounded-[18px] rounded-br-[6px] bg-fill-2 bg-gloss px-3.5 py-2 text-callout text-label shadow-gloss">
        {props.ask}
      </p>
      <div class="flex gap-2.5">
        <img
          src="/logo.svg"
          alt=""
          class="mt-0.5 size-6 shrink-0 rounded-[7px] shadow-[0_0_14px_-2px_rgb(255_214_10/0.6)]"
        />
        <div class="flex min-w-0 flex-col gap-2.5">
          <p class="text-callout text-label">{props.reply}</p>
          <div class="rim relative w-32 overflow-hidden rounded-[14px] shadow-raised md:w-36">
            <Picture sample={props.sample} sizes="144px" />
          </div>
        </div>
      </div>
    </>
  )
}
