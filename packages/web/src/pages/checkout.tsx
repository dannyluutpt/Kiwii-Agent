import { A, useNavigate, useParams } from "@solidjs/router"
import { createEffect, createResource, createSignal, Match, onCleanup, Show, Switch, type JSX } from "solid-js"
import { api } from "@/api"
import { CopyButton } from "@/components/copy-button"
import { IconCheck, IconChevronLeft, IconRefresh } from "@/components/icons"
import { Page } from "@/components/page"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { errorMessage } from "@/lib/errors"
import { createNow, remaining } from "@/lib/time"
import { Button, buttonClass } from "@/ui/button"
import { IconButton } from "@/ui/icon-button"
import { ListGroup, ListRow, ListSection } from "@/ui/list"
import { Skeleton } from "@/ui/skeleton"
import { toast } from "@/ui/toast"
import { orderItem, planName, topupCredits, vnd, type Order } from "@/billing"

// Bank transfer checkout: scan the VietQR code or copy the details by hand, then wait here while
// SePay reports the transfer; the order flips to paid on its own within seconds.
export default function Checkout() {
  const { t } = useLanguage()
  const auth = useAuth()
  const navigate = useNavigate()
  const params = useParams<{ orderId: string }>()
  const [order, { refetch }] = createResource(
    () => params.orderId,
    (id) => api<Order>(`/billing/orders/${id}`),
  )
  const [qrFailed, setQrFailed] = createSignal(false)
  const [qrLoaded, setQrLoaded] = createSignal(false)
  const [renewing, setRenewing] = createSignal(false)
  const now = createNow(1000)

  const left = () => {
    const o = order.latest
    return o ? remaining(o.expiresAt - now()) : undefined
  }
  const waiting = () => order.latest?.status === "pending" && left()?.kind !== "expired"
  const status = () => {
    const o = order.latest
    if (!o) return undefined
    return o.status === "pending" && left()?.kind === "expired" ? "expired" : o.status
  }

  // Poll while the order can still be paid; stop once it is settled or out of time.
  const timer = setInterval(() => {
    if (waiting()) void refetch()
  }, 3000)
  onCleanup(() => clearInterval(timer))

  // The plan or the credits show up everywhere else (sidebar, account) as soon as it is paid.
  createEffect(() => {
    if (status() === "paid") void auth.refresh()
  })

  const renew = async () => {
    const o = order.latest
    if (!o) return
    setRenewing(true)
    await api<{ id: string }>("/billing/orders", { body: { kind: o.kind, id: o.itemID } })
      .then((created) => navigate(`/pricing/checkout/${created.id}`, { replace: true }))
      .catch((error: unknown) => toast.error(errorMessage(error, t("error.generic"))))
    setRenewing(false)
  }

  const timeLeft = () => {
    const l = left()
    if (!l || l.kind === "expired") return ""
    if (l.kind === "clock") return l.text
    if (l.kind === "minutes") return t("time.minutes", { m: l.minutes })
    return t("time.hours", { h: l.hours, m: l.minutes })
  }

  return (
    <Page
      title={t("checkout.title")}
      width="narrow"
      leading={
        <IconButton label={t("checkout.back")} icon={<IconChevronLeft />} onClick={() => navigate("/pricing")} />
      }
    >
      <Show
        when={order.latest}
        fallback={
          <div class="flex flex-col gap-6" aria-hidden="true">
            <Skeleton class="h-16 w-2/3" />
            <Skeleton class="mx-auto size-60 rounded-[20px]" />
            <Skeleton class="h-48 w-full rounded-card" />
          </div>
        }
      >
        {(o) => (
          <div class="flex flex-col gap-8">
            <header class="flex flex-col gap-1.5">
              <p class="text-subhead text-label-2">{orderItem(o(), t)}</p>
              <p class="text-large-title text-label tabular-nums">{vnd(o().amountVnd)}</p>
              <p class="flex items-center gap-2 text-subhead" role="status" aria-live="polite">
                <Switch>
                  <Match when={status() === "pending"}>
                    <span class="relative flex size-2.5" aria-hidden="true">
                      <span class="absolute inline-flex size-full animate-ping rounded-full bg-info opacity-60 motion-reduce:animate-none" />
                      <span class="relative inline-flex size-2.5 rounded-full bg-info" />
                    </span>
                    <span class="text-label">{t("checkout.waitingShort")}</span>
                    <span class="text-label-2 tabular-nums">· {t("checkout.expiresIn", { time: timeLeft() })}</span>
                  </Match>
                  <Match when={status() === "paid"}>
                    <span class="text-success">{t("checkout.paid")}</span>
                  </Match>
                  <Match when={status() === "expired"}>
                    <span class="text-danger">{t("checkout.expired.title")}</span>
                  </Match>
                  <Match when={status() === "pending_review"}>
                    <span class="text-warning">{t("checkout.review.title")}</span>
                  </Match>
                </Switch>
              </p>
            </header>

            <Switch>
              <Match when={status() === "paid"}>
                <Outcome
                  tone="success"
                  icon={<IconCheck class="size-7" weight={2.5} />}
                  title={
                    o().kind === "plan"
                      ? t("checkout.paid.plan", { name: planName(o().itemID) })
                      : t("checkout.paid.topup", { n: topupCredits(o().itemID) })
                  }
                  lead={t("checkout.paid.lead")}
                >
                  <A href={o().kind === "plan" ? "/chat" : "/images"} class={buttonClass("primary", "lg", "w-full")}>
                    {o().kind === "plan" ? t("checkout.startChat") : t("checkout.startImages")}
                  </A>
                  <A href="/account" class={buttonClass("secondary", "lg", "w-full")}>
                    {t("nav.account")}
                  </A>
                </Outcome>
              </Match>
              <Match when={status() === "expired"}>
                <Outcome
                  tone="danger"
                  icon={<IconRefresh class="size-7" weight={2} />}
                  title={t("checkout.expired.title")}
                  lead={t("checkout.expired.lead")}
                >
                  <Button variant="primary" size="lg" block loading={renewing()} onClick={() => void renew()}>
                    {t("checkout.newOrder")}
                  </Button>
                </Outcome>
              </Match>
              <Match when={status() === "pending_review"}>
                <Outcome tone="warning" title={t("checkout.review.title")} lead={t("checkout.review")}>
                  <A href="/account" class={buttonClass("secondary", "lg", "w-full")}>
                    {t("nav.account")}
                  </A>
                </Outcome>
              </Match>
              <Match when={status() === "pending"}>
                <div class="flex flex-col gap-8 md:flex-row md:items-start">
                  <figure class="flex flex-col items-center gap-3 md:sticky md:top-20">
                    <div class="relative flex size-64 items-center justify-center overflow-hidden rounded-[22px] bg-white p-3 shadow-raised">
                      <Show
                        when={!qrFailed()}
                        fallback={
                          <p class="px-4 text-center text-subhead text-[#5f5f56]" role="note">
                            {t("checkout.qrFailed")}
                          </p>
                        }
                      >
                        <Show when={!qrLoaded()}>
                          <span class="absolute inset-3 animate-pulse rounded-[12px] bg-[#f2f2ee]" aria-hidden="true" />
                        </Show>
                        <img
                          src={o().qrUrl}
                          alt={t("checkout.qrAlt", { amount: vnd(o().amountVnd), memo: o().memo })}
                          class="relative size-full object-contain transition-opacity duration-(--motion-standard)"
                          classList={{ "opacity-0": !qrLoaded() }}
                          onLoad={() => setQrLoaded(true)}
                          onError={() => setQrFailed(true)}
                        />
                      </Show>
                    </div>
                    <figcaption class="text-footnote text-label-2">{t("checkout.scan")}</figcaption>
                  </figure>

                  <div class="min-w-0 flex-1">
                    <ListSection title={t("checkout.manual")} footer={t("checkout.memoHint")}>
                      <ListGroup>
                        <ListRow label={t("checkout.bank")}>
                          <span class="text-callout text-label">{o().bank.code}</span>
                        </ListRow>
                        <ListRow label={t("checkout.account")} detail={o().bank.name ?? undefined}>
                          <Value mono>{o().bank.account}</Value>
                          <CopyButton value={o().bank.account} label={t("checkout.copyAccount")} />
                        </ListRow>
                        <ListRow label={t("checkout.amount")}>
                          <Value mono>{vnd(o().amountVnd)}</Value>
                          <CopyButton value={String(o().amountVnd)} label={t("checkout.copyAmount")} />
                        </ListRow>
                        <ListRow label={t("checkout.memo")}>
                          <Value mono strong>
                            {o().memo}
                          </Value>
                          <CopyButton value={o().memo} label={t("checkout.copyMemo")} />
                        </ListRow>
                      </ListGroup>
                    </ListSection>
                  </div>
                </div>
              </Match>
            </Switch>
          </div>
        )}
      </Show>
    </Page>
  )
}

function Value(props: { children: JSX.Element; mono?: boolean; strong?: boolean }) {
  return (
    <span
      class="text-right text-callout text-label tabular-nums"
      classList={{ "font-mono": props.mono, "text-headline font-semibold text-accent": props.strong }}
    >
      {props.children}
    </span>
  )
}

const OUTCOME_TONES = {
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
}

// The end of a checkout: what happened, in one sentence, and where to go next.
function Outcome(props: {
  tone: keyof typeof OUTCOME_TONES
  icon?: JSX.Element
  title: string
  lead: string
  children: JSX.Element
}) {
  return (
    <div class="flex flex-col items-center gap-4 rounded-panel bg-surface px-6 py-8 text-center shadow-raised animate-rise-in">
      <Show when={props.icon}>
        <span class={`flex size-14 items-center justify-center rounded-full ${OUTCOME_TONES[props.tone]}`}>
          {props.icon}
        </span>
      </Show>
      <div class="flex flex-col gap-1.5">
        <h2 class="text-title-2 text-label">{props.title}</h2>
        <p class="text-callout text-label-2">{props.lead}</p>
      </div>
      <div class="mt-2 flex w-full max-w-xs flex-col gap-2">{props.children}</div>
    </div>
  )
}
