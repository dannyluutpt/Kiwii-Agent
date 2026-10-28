import { useNavigate } from "@solidjs/router"
import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { api } from "@/api"
import { IconCheck } from "@/components/icons"
import { Page } from "@/components/page"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { errorMessage } from "@/lib/errors"
import { Button } from "@/ui/button"
import { Skeleton } from "@/ui/skeleton"
import { Tag } from "@/ui/tag"
import { toast } from "@/ui/toast"

export type PlanInfo = {
  id: "free" | "starter" | "plus" | "ultra"
  name: string
  priceVnd: number
  credits: number
  chatDailyMessages: number | null
  chatMonthlyMessages: number | null
  chatContextTokens: number
  parallelLimit: number
}
type Topup = { id: string; credits: number; priceVnd: number }

export const vnd = (n: number) => `${n.toLocaleString("vi-VN")} ₫`

export default function Pricing() {
  const { t } = useLanguage()
  const auth = useAuth()
  const navigate = useNavigate()
  const [data] = createResource(() => api<{ plans: PlanInfo[]; topups: Topup[] }>("/billing/plans"))
  const [busy, setBusy] = createSignal<string>()

  const order = async (kind: "plan" | "topup", id: string) => {
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

  const tier = () => auth.me()?.tier ?? "free"
  const paidActive = () => {
    const me = auth.me()
    return !!me && me.tier !== "free" && !!me.tierUntil && me.tierUntil > Date.now()
  }

  return (
    <Page title={t("pricing.title")} subtitle={t("pricing.lead")} align="center">
      <div class="flex flex-col gap-8">
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4" aria-busy={data.loading}>
          <Show when={data.loading}>
            <For each={[0, 1, 2, 3]}>
              {() => (
                <div class="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-raised" aria-hidden="true">
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
              <div
                class="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-raised"
                classList={{ "shadow-[var(--k-shadow-raised),0_0_0_1.5px_var(--k-accent)]": plan.id === "plus" }}
              >
                <div class="flex flex-col gap-1">
                  <span class="flex items-center justify-between gap-2 text-headline text-label">
                    {plan.name}
                    <Show when={plan.id === "plus"}>
                      <Tag tone="accent">{t("pricing.popular")}</Tag>
                    </Show>
                  </span>
                  <span class="text-title-2 text-label">
                    {vnd(plan.priceVnd)}
                    <span class="text-footnote font-normal text-label-2">{t("pricing.perMonth")}</span>
                  </span>
                </div>
                <ul class="flex flex-col gap-2 text-subhead text-label">
                  <Feature>{plan.id === "free" ? t("pricing.freeModel") : t("pricing.paidModel")}</Feature>
                  <Feature>
                    {plan.chatDailyMessages !== null
                      ? t("pricing.chatDaily", { n: plan.chatDailyMessages.toLocaleString("vi-VN") })
                      : t("pricing.chatMonthly", { n: (plan.chatMonthlyMessages ?? 0).toLocaleString("vi-VN") })}
                  </Feature>
                  <Feature>{t("pricing.context", { k: Math.round(plan.chatContextTokens / 1000) })}</Feature>
                  <Feature muted={plan.credits === 0}>
                    {plan.credits > 0
                      ? t("pricing.credits", { credits: plan.credits.toLocaleString("vi-VN") })
                      : t("pricing.noImages")}
                  </Feature>
                  <Show when={plan.credits > 0}>
                    <Feature>{t("pricing.imageModels")}</Feature>
                    <Feature>{t("pricing.parallel", { n: plan.parallelLimit })}</Feature>
                  </Show>
                </ul>
                <div class="flex-1" />
                <Show
                  when={plan.id !== "free"}
                  fallback={
                    <Button variant="secondary" block disabled>
                      {tier() === "free" ? t("pricing.current") : t("pricing.free")}
                    </Button>
                  }
                >
                  <Button
                    variant={plan.id === "plus" ? "primary" : "secondary"}
                    block
                    loading={busy() === plan.id}
                    disabled={busy() !== undefined}
                    onClick={() => void order("plan", plan.id)}
                  >
                    {tier() === plan.id && paidActive() ? t("pricing.renew") : t("pricing.choose")}
                  </Button>
                </Show>
              </div>
            )}
          </For>
        </div>
        <section class="flex flex-col gap-4 rounded-card bg-surface p-5 shadow-raised">
          <div class="flex flex-col gap-1">
            <h2 class="text-title-3 text-label">{t("pricing.topups.title")}</h2>
            <p class="text-subhead text-label-2">{t("pricing.topups.lead")}</p>
          </div>
          <div class="flex flex-wrap gap-3">
            <For each={data()?.topups}>
              {(pack) => (
                <Button
                  variant="secondary"
                  loading={busy() === pack.id}
                  disabled={!paidActive() || busy() !== undefined}
                  onClick={() => void order("topup", pack.id)}
                >
                  {t("pricing.topups.buy", { credits: pack.credits })} · {vnd(pack.priceVnd)}
                </Button>
              )}
            </For>
          </div>
        </section>
      </div>
    </Page>
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
