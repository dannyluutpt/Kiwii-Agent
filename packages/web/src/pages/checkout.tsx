import { A, useNavigate, useParams } from "@solidjs/router"
import { createResource, onCleanup, Show } from "solid-js"
import { Button } from "@kiwii/ui/button"
import { showToast } from "@kiwii/ui/toast"
import { api } from "@/api"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { vnd } from "./pricing"

type Order = {
  id: string
  amountVnd: number
  memo: string
  status: "pending" | "paid" | "expired" | "pending_review"
  expiresAt: number
  bank: { code: string; account: string; name: string | null }
  qrUrl: string
}

export default function Checkout() {
  const { t } = useLanguage()
  const auth = useAuth()
  const navigate = useNavigate()
  const params = useParams<{ orderId: string }>()
  const [order, { refetch }] = createResource(() => api<Order>(`/billing/orders/${params.orderId}`))

  // Poll until the webhook flips the order; SePay usually lands within a few seconds.
  const timer = setInterval(() => {
    if (order()?.status === "pending") void refetch()
  }, 3000)
  onCleanup(() => clearInterval(timer))

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text).then(() => showToast({ title: t("checkout.copied"), variant: "success" }))
  }

  return (
    <div class="flex-1 overflow-y-auto">
      <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
        <div class="flex flex-col gap-1">
          <h1 class="text-20-medium text-text-strong">{t("checkout.title")}</h1>
          <p class="text-14-regular text-text-weak">{t("checkout.lead")}</p>
        </div>
        <Show when={order()}>
          {(o) => (
            <div class="flex flex-col gap-6 rounded-2xl border border-border-weak-base bg-surface-raised-base p-6 md:flex-row">
              <img src={o().qrUrl} alt="VietQR" class="mx-auto w-64 rounded-lg bg-white" />
              <div class="flex flex-1 flex-col gap-3 text-14-regular">
                <Row
                  label={t("checkout.amount")}
                  value={vnd(o().amountVnd)}
                  onCopy={() => copy(String(o().amountVnd))}
                />
                <Row label={t("checkout.memo")} value={o().memo} onCopy={() => copy(o().memo)} strong />
                <Row label={t("checkout.bank")} value={o().bank.code} />
                <Row label={t("checkout.account")} value={o().bank.account} onCopy={() => copy(o().bank.account)} />
                <Show when={o().bank.name}>
                  <Row label="" value={o().bank.name!} />
                </Show>
                <div class="mt-2 rounded-md px-3 py-2 text-13-regular" classList={statusClass(o().status)}>
                  {o().status === "pending" && t("checkout.waiting")}
                  {o().status === "paid" && t("checkout.paid")}
                  {o().status === "expired" && t("checkout.expired")}
                  {o().status === "pending_review" && t("checkout.review")}
                </div>
                <Show when={o().status === "paid"}>
                  <Button
                    variant="primary"
                    onClick={() => {
                      void auth.refresh()
                      navigate("/account")
                    }}
                  >
                    {t("nav.account")}
                  </Button>
                </Show>
              </div>
            </div>
          )}
        </Show>
        <A href="/pricing" class="text-13-regular text-text-weak">
          ← {t("checkout.back")}
        </A>
      </div>
    </div>
  )
}

function statusClass(status: Order["status"]) {
  return {
    "bg-surface-info-weak text-text-on-info-base": status === "pending",
    "bg-surface-success-weak text-text-on-success-base": status === "paid",
    "bg-surface-critical-weak text-text-on-critical-base": status === "expired",
    "bg-surface-warning-weak text-text-on-warning-base": status === "pending_review",
  }
}

function Row(props: { label: string; value: string; onCopy?: () => void; strong?: boolean }) {
  const { t } = useLanguage()
  return (
    <div class="flex items-center justify-between gap-3">
      <span class="text-text-weak">{props.label}</span>
      <span class="flex items-center gap-2">
        <span class="font-mono text-text-strong" classList={{ "text-16-medium": props.strong }}>
          {props.value}
        </span>
        <Show when={props.onCopy}>
          <button type="button" class="text-12-regular text-text-interactive-base" onClick={() => props.onCopy?.()}>
            {t("checkout.copy")}
          </button>
        </Show>
      </span>
    </div>
  )
}
