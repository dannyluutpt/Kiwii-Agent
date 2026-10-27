import { useNavigate } from "@solidjs/router"
import { createResource, createSignal, For, Show } from "solid-js"
import { Button } from "@kiwii/ui/button"
import { showToast } from "@kiwii/ui/toast"
import { api, ApiError } from "@/api"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"

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
      showToast({ title: error instanceof ApiError ? error.message : t("error.generic"), variant: "error" })
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
    <div class="flex-1 overflow-y-auto">
      <div class="mx-auto flex w-full max-w-5xl flex-col gap-8 px-6 py-10">
        <div class="flex flex-col gap-1 text-center">
          <h1 class="text-20-medium text-text-strong">{t("pricing.title")}</h1>
          <p class="text-14-regular text-text-weak">{t("pricing.lead")}</p>
        </div>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <For each={data()?.plans}>
            {(plan) => (
              <div
                class="flex flex-col gap-4 rounded-2xl border border-border-weak-base bg-surface-raised-base p-5"
                classList={{ "border-border-interactive-base": plan.id === "plus" }}
              >
                <div class="flex flex-col gap-1">
                  <span class="text-14-medium text-text-strong">{plan.name}</span>
                  <span class="text-20-medium text-text-strong">
                    {plan.priceVnd === 0 ? t("pricing.free") : vnd(plan.priceVnd)}
                    <Show when={plan.priceVnd > 0}>
                      <span class="text-13-regular text-text-weak">{t("pricing.perMonth")}</span>
                    </Show>
                  </span>
                </div>
                <ul class="flex flex-col gap-1.5 text-13-regular text-text-base">
                  <li>{plan.id === "free" ? t("pricing.freeModel") : t("pricing.paidModel")}</li>
                  <li>
                    {plan.chatDailyMessages !== null
                      ? t("pricing.chatDaily", { n: plan.chatDailyMessages.toLocaleString("vi-VN") })
                      : t("pricing.chatMonthly", { n: (plan.chatMonthlyMessages ?? 0).toLocaleString("vi-VN") })}
                  </li>
                  <li>{t("pricing.context", { k: Math.round(plan.chatContextTokens / 1000) })}</li>
                  <li>
                    {plan.credits > 0
                      ? t("pricing.credits", { credits: plan.credits.toLocaleString("vi-VN") })
                      : t("pricing.noImages")}
                  </li>
                  <Show when={plan.credits > 0}>
                    <li>{t("pricing.imageModels")}</li>
                    <li>{t("pricing.parallel", { n: plan.parallelLimit })}</li>
                  </Show>
                </ul>
                <div class="flex-1" />
                <Show
                  when={plan.id !== "free"}
                  fallback={
                    <Button variant="secondary" disabled>
                      {tier() === "free" ? t("pricing.current") : t("pricing.free")}
                    </Button>
                  }
                >
                  <Button
                    variant={plan.id === "plus" ? "primary" : "secondary"}
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
        <div class="flex flex-col gap-3 rounded-2xl border border-border-weak-base p-5">
          <div class="flex flex-col gap-1">
            <h2 class="text-16-medium text-text-strong">{t("pricing.topups.title")}</h2>
            <p class="text-13-regular text-text-weak">{t("pricing.topups.lead")}</p>
          </div>
          <div class="flex flex-wrap gap-3">
            <For each={data()?.topups}>
              {(pack) => (
                <Button
                  variant="secondary"
                  disabled={!paidActive() || busy() !== undefined}
                  onClick={() => void order("topup", pack.id)}
                >
                  {t("pricing.topups.buy", { credits: pack.credits })} · {vnd(pack.priceVnd)}
                </Button>
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  )
}
