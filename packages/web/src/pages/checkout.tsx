import { useNavigate, useParams } from "@solidjs/router"
import { createResource, onCleanup, Show } from "solid-js"
import { api } from "@/api"
import { IconChevronLeft } from "@/components/icons"
import { Page } from "@/components/page"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { Button } from "@/ui/button"
import { IconButton } from "@/ui/icon-button"
import { Skeleton } from "@/ui/skeleton"
import { toast } from "@/ui/toast"
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
    void navigator.clipboard.writeText(text).then(() => toast.success(t("checkout.copied")))
  }

  return (
    <Page
      title={t("checkout.title")}
      subtitle={t("checkout.lead")}
      width="narrow"
      leading={
        <IconButton label={t("checkout.back")} icon={<IconChevronLeft />} onClick={() => navigate("/pricing")} />
      }
    >
      <Show
        when={order()}
        fallback={
          <div class="flex flex-col gap-6 rounded-card bg-surface p-6 shadow-raised md:flex-row" aria-hidden="true">
            <Skeleton class="mx-auto aspect-square w-64 rounded-[14px]" />
            <div class="flex flex-1 flex-col gap-4">
              <Skeleton class="h-4 w-full" />
              <Skeleton class="h-4 w-5/6" />
              <Skeleton class="h-4 w-2/3" />
              <Skeleton class="h-4 w-3/4" />
            </div>
          </div>
        }
      >
        {(o) => (
          <div class="flex flex-col gap-6 rounded-card bg-surface p-5 shadow-raised md:flex-row md:p-6">
            <img src={o().qrUrl} alt="VietQR" class="mx-auto w-64 rounded-[14px] bg-white p-2" />
            <div class="flex flex-1 flex-col gap-3 text-callout">
              <Row label={t("checkout.amount")} value={vnd(o().amountVnd)} onCopy={() => copy(String(o().amountVnd))} />
              <Row label={t("checkout.memo")} value={o().memo} onCopy={() => copy(o().memo)} strong />
              <Row label={t("checkout.bank")} value={o().bank.code} />
              <Row label={t("checkout.account")} value={o().bank.account} onCopy={() => copy(o().bank.account)} />
              <Show when={o().bank.name}>
                <Row label="" value={o().bank.name!} />
              </Show>
              <div
                class="mt-2 rounded-[12px] px-3 py-2.5 text-subhead"
                role="status"
                classList={statusClass(o().status)}
              >
                {o().status === "pending" && t("checkout.waiting")}
                {o().status === "paid" && t("checkout.paid")}
                {o().status === "expired" && t("checkout.expired")}
                {o().status === "pending_review" && t("checkout.review")}
              </div>
              <Show when={o().status === "paid"}>
                <Button
                  variant="primary"
                  block
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
    </Page>
  )
}

function statusClass(status: Order["status"]) {
  return {
    "bg-info-soft text-info": status === "pending",
    "bg-success-soft text-success": status === "paid",
    "bg-danger-soft text-danger": status === "expired",
    "bg-warning-soft text-warning": status === "pending_review",
  }
}

function Row(props: { label: string; value: string; onCopy?: () => void; strong?: boolean }) {
  const { t } = useLanguage()
  return (
    <div class="flex items-center justify-between gap-3">
      <span class="text-label-2">{props.label}</span>
      <span class="flex items-center gap-2">
        <span class="font-mono text-label" classList={{ "text-headline": props.strong }}>
          {props.value}
        </span>
        <Show when={props.onCopy}>
          <button
            type="button"
            class="rounded-[8px] px-2 py-1 text-footnote font-semibold text-accent hover:bg-accent-soft"
            aria-label={`${t("checkout.copy")} ${props.label}`}
            onClick={() => props.onCopy?.()}
          >
            {t("checkout.copy")}
          </button>
        </Show>
      </span>
    </div>
  )
}
