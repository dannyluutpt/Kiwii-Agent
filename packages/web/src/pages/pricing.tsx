import { A, useNavigate } from "@solidjs/router"
import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { api } from "@/api"
import { vnd, type PlanInfo, type Topup, type Trial } from "@/billing"
import { IconCheck, IconChevronDown, IconSparkles } from "@/components/icons"
import { Page } from "@/components/page"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import type { I18nKey } from "@/i18n/vi"
import { errorMessage } from "@/lib/errors"
import { Button, buttonClass } from "@/ui/button"
import { Skeleton } from "@/ui/skeleton"
import { Tag } from "@/ui/tag"
import { toast } from "@/ui/toast"

const FAQ: Array<{ q: I18nKey; a: I18nKey }> = [
  { q: "pricing.faq.pay.q", a: "pricing.faq.pay.a" },
  { q: "pricing.faq.renew.q", a: "pricing.faq.renew.a" },
  { q: "pricing.faq.credits.q", a: "pricing.faq.credits.a" },
  { q: "pricing.faq.short.q", a: "pricing.faq.short.a" },
]

export default function Pricing() {
  const { t } = useLanguage()
  return (
    <Page title={t("pricing.title")} subtitle={t("pricing.lead")} align="center">
      <PricingPlans />
    </Page>
  )
}

// The plans, the top-ups and the questions, in the app and on the public website. A visitor who is
// not signed in creates an account before choosing.
export function PricingPlans() {
  const { t, locale } = useLanguage()
  const auth = useAuth()
  const navigate = useNavigate()
  const [data] = createResource(() => api<{ plans: PlanInfo[]; topups: Topup[]; trial: Trial }>("/billing/plans"))
  const [busy, setBusy] = createSignal<string>()

  const order = async (kind: "plan" | "topup", id: string) => {
    if (!auth.me()) {
      navigate(`/signup?next=${encodeURIComponent("/pricing")}`)
      return
    }
    setBusy(id)
    try {
      const created = await api<{ id: string }>("/billing/orders", { body: { kind, id } })
      navigate(`/pricing/checkout/${created.id}`)
    } catch (error) {
      toast.error(errorMessage(error, t("error.generic")))
    } finally {
      setBusy(undefined)
    }
  }

  const paidActive = () => {
    const me = auth.me()
    return !!me && me.tier !== "free" && !!me.tierUntil && me.tierUntil > Date.now()
  }
  // The plan this account is on right now: a paid tier that has lapsed counts as free. A visitor
  // who is not signed in has none.
  const current = () => {
    if (!auth.me()) return undefined
    return paidActive() ? auth.me()?.tier : "free"
  }
  const until = () => {
    const ms = auth.me()?.tierUntil
    return ms ? new Date(ms).toLocaleDateString(locale() === "vi" ? "vi-VN" : "en-US") : ""
  }

  return (
    <div class="flex flex-col gap-10">
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-busy={data.loading}>
        <Show when={data.loading}>
          <For each={[0, 1, 2, 3]}>
            {() => (
              <div class="flex flex-col gap-4 rounded-card bg-surface bg-sheen p-5 shadow-raised" aria-hidden="true">
                <Skeleton class="h-4 w-1/3" />
                <Skeleton class="h-7 w-2/3" />
                <Skeleton class="h-3 w-full" />
                <Skeleton class="h-3 w-5/6" />
                <Skeleton class="h-3 w-4/6" />
                <Skeleton class="mt-6 h-10 w-full rounded-control" />
              </div>
            )}
          </For>
        </Show>
        <For each={data()?.plans}>
          {(plan) => (
            <article
              // The popular plan glows. One shadow class either way: two would fight over the order.
              class={`rim relative flex flex-col gap-4 rounded-card bg-surface bg-sheen p-5 ${
                plan.id === "plus"
                  ? "shadow-[var(--k-shadow-raised),0_0_0_1.5px_var(--k-accent),0_18px_48px_-14px_rgb(255_200_0/0.45)]"
                  : "shadow-raised"
              }`}
              aria-label={plan.name}
            >
              <div class="flex flex-col gap-1">
                <span class="flex min-h-6 items-center justify-between gap-2 text-headline text-label">
                  {plan.name}
                  <Show
                    when={current() === plan.id}
                    fallback={
                      <Show when={plan.id === "plus"}>
                        <Tag tone="accent">{t("pricing.popular")}</Tag>
                      </Show>
                    }
                  >
                    <Tag tone="success">{t("pricing.current")}</Tag>
                  </Show>
                </span>
                <span class="text-title-2 text-label tabular-nums">
                  {vnd(plan.priceVnd)}
                  <span class="text-footnote font-normal text-label-2">{t("pricing.perMonth")}</span>
                </span>
                <Show when={current() === plan.id && plan.id !== "free"}>
                  <span class="text-footnote text-label-2">{t("pricing.until", { date: until() })}</span>
                </Show>
              </div>
              <ul class="flex flex-col gap-2 text-subhead text-label">
                <Show
                  when={plan.id === "free"}
                  fallback={
                    <Feature>{t("pricing.credits", { credits: plan.credits.toLocaleString("vi-VN") })}</Feature>
                  }
                >
                  <Feature muted={!data()?.trial.available}>
                    {t(data()?.trial.available ? "pricing.trial" : "pricing.noImages")}
                  </Feature>
                </Show>
                <Show when={plan.credits > 0}>
                  <Feature>{t("pricing.imageModels")}</Feature>
                  <Feature>{t("pricing.parallel", { n: plan.parallelLimit })}</Feature>
                </Show>
              </ul>
              <div class="flex-1" />
              <Show
                when={plan.id !== "free"}
                fallback={
                  <Show
                    when={auth.me()}
                    fallback={
                      <A href="/signup" class={buttonClass("secondary", "md", "w-full")}>
                        {t("site.start")}
                      </A>
                    }
                  >
                    <Button variant="secondary" block disabled>
                      {current() === "free" ? t("pricing.current") : t("pricing.free")}
                    </Button>
                  </Show>
                }
              >
                <Button
                  variant={plan.id === "plus" || current() === plan.id ? "primary" : "secondary"}
                  block
                  loading={busy() === plan.id}
                  disabled={busy() !== undefined}
                  onClick={() => void order("plan", plan.id)}
                >
                  {current() === plan.id ? t("pricing.renew") : t("pricing.choose")}
                </Button>
              </Show>
            </article>
          )}
        </For>
      </div>

      <section class="flex flex-col gap-4 rounded-card bg-surface bg-sheen p-5 shadow-raised" aria-labelledby="topups">
        <div class="flex flex-col gap-1">
          <h2 id="topups" class="text-title-3 text-label">
            {t("pricing.topups.title")}
          </h2>
          <p class="text-subhead text-label-2">{t("pricing.topups.lead")}</p>
        </div>
        <div class="grid gap-3 sm:grid-cols-2">
          <For each={data()?.topups}>
            {(pack) => (
              <div class="flex items-center gap-3 rounded-[16px] bg-fill bg-gloss px-4 py-3 shadow-gloss">
                <span class="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft bg-amber-soft-gloss text-accent shadow-tinted">
                  <IconSparkles class="size-5" />
                </span>
                <span class="flex min-w-0 flex-1 flex-col">
                  <span class="text-headline text-label">{t("plan.credits", { credits: pack.credits })}</span>
                  <span class="text-footnote text-label-2 tabular-nums">{vnd(pack.priceVnd)}</span>
                </span>
                <Button
                  variant={paidActive() ? "primary" : "secondary"}
                  size="sm"
                  pill
                  loading={busy() === pack.id}
                  disabled={!paidActive() || busy() !== undefined}
                  aria-label={t("pricing.topups.buy", { credits: pack.credits })}
                  onClick={() => void order("topup", pack.id)}
                >
                  {t("pricing.topups.cta")}
                </Button>
              </div>
            )}
          </For>
        </div>
        <Show when={!paidActive() && data()}>
          <p class="text-footnote text-label-2">{t("pricing.topups.needPlan")}</p>
        </Show>
      </section>

      <section class="mx-auto flex w-full max-w-2xl flex-col gap-3" aria-labelledby="faq">
        <h2 id="faq" class="px-1 text-title-3 text-label">
          {t("pricing.faq.title")}
        </h2>
        <div class="overflow-hidden rounded-card bg-surface bg-sheen shadow-raised [&>*+*]:border-t [&>*+*]:border-separator">
          <For each={FAQ}>
            {(item) => (
              <details class="group">
                <summary class="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-callout font-medium text-label transition-[background-color] duration-(--motion-micro) hover:bg-fill [&::-webkit-details-marker]:hidden">
                  {t(item.q)}
                  <IconChevronDown class="size-4 shrink-0 text-label-3 transition-transform duration-(--motion-standard) group-open:rotate-180" />
                </summary>
                <p class="px-4 pb-4 text-subhead text-label-2">{t(item.a)}</p>
              </details>
            )}
          </For>
        </div>
      </section>
    </div>
  )
}

function Feature(props: { children: JSX.Element; muted?: boolean }) {
  return (
    <li class="flex items-start gap-2" classList={{ "text-label-2": props.muted }}>
      <IconCheck class="mt-0.5 size-4 shrink-0 text-accent" weight={2.25} />
      <span>{props.children}</span>
    </li>
  )
}
