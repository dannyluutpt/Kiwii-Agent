import { useNavigate } from "@solidjs/router"
import { createResource, createSignal, For, Show } from "solid-js"
import { useTheme } from "@kiwii/ui/theme/context"
import { api } from "@/api"
import { orderItem, vnd, type Order } from "@/billing"
import { IconAuto, IconLogout, IconMoon, IconSparkles, IconSun } from "@/components/icons"
import { Page } from "@/components/page"
import { useAuth } from "@/context/auth"
import { useLanguage, type Locale } from "@/context/language"
import { errorMessage } from "@/lib/errors"
import { Avatar } from "@/ui/avatar"
import { Button } from "@/ui/button"
import { ListGroup, ListRow, ListSection } from "@/ui/list"
import { Segmented } from "@/ui/segmented"
import { Skeleton } from "@/ui/skeleton"
import { Tag } from "@/ui/tag"
import { TextField } from "@/ui/text-field"
import { toast } from "@/ui/toast"

type Subscription = { tier: string; tierUntil: number | null; periodEnd: number | null; credits: number }
type Entry = {
  id: string
  type: "grant" | "reserve" | "refund" | "settle" | "expire"
  delta: number
  balanceAfter: number
  reason: string
  createdAt: number
}

const ORDER_TONES = { pending: "info", paid: "success", expired: "neutral", pending_review: "warning" } as const
const LEDGER_PAGE = 8

export default function Account() {
  const { t, locale, setLocale } = useLanguage()
  const auth = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()
  const [sub] = createResource(() => api<Subscription>("/billing/subscription"))
  // Settled runs that used exactly what they reserved move no credit; they would only be noise here.
  const [ledger] = createResource(() =>
    api<{ entries: Entry[] }>("/billing/ledger").then((r) => r.entries.filter((e) => e.delta !== 0)),
  )
  const [orders] = createResource(() => api<{ orders: Order[] }>("/billing/orders").then((r) => r.orders.slice(0, 5)))
  const [shown, setShown] = createSignal(LEDGER_PAGE)
  const [current, setCurrent] = createSignal("")
  const [next, setNext] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  const tag = () => (locale() === "vi" ? "vi-VN" : "en-US")
  const date = (ms: number) => new Date(ms).toLocaleDateString(tag())
  const dateTime = (ms: number) =>
    new Date(ms).toLocaleString(tag(), { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  const paid = () => sub()?.tier !== undefined && sub()?.tier !== "free"
  // A pending order past its deadline can no longer be paid, even before the server marks it.
  const state = (o: Order) => (o.status === "pending" && o.expiresAt <= Date.now() ? "expired" : o.status)

  const changePassword = async () => {
    setBusy(true)
    await api("/account/password", { body: { current: current(), next: next() } })
      .then(() => {
        toast.success(t("account.password.done"))
        setCurrent("")
        setNext("")
      })
      .catch((error: unknown) => toast.error(errorMessage(error, t("error.generic"))))
    setBusy(false)
  }

  const changeLocale = (value: Locale) => {
    setLocale(value)
    void api("/account", { method: "PATCH", body: { locale: value } }).catch(() => {})
  }

  return (
    <Page title={t("account.title")} width="narrow">
      <div class="flex flex-col gap-8">
        <ListGroup>
          <div class="flex items-center gap-4 p-4">
            <Avatar name={auth.me()?.user.email ?? ""} class="size-12 text-title-3" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-headline text-label">{auth.me()?.user.email}</p>
              <Show when={sub()} fallback={<Skeleton class="mt-1.5 h-3 w-32" />}>
                {(s) => (
                  <p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-footnote text-label-2">
                    <Tag tone={s().tier === "free" ? "neutral" : "accent"}>
                      {s().tier === "free" ? t("plan.free") : auth.me()?.plan.name}
                    </Tag>
                    <Show when={s().tier !== "free" && s().tierUntil}>
                      {(until) => <span>{t("account.until", { date: date(until()) })}</span>}
                    </Show>
                  </p>
                )}
              </Show>
            </div>
          </div>
          <ListRow label={t("account.credits")}>
            <span class="text-headline text-label tabular-nums">
              {(sub()?.credits ?? auth.me()?.credits ?? 0).toLocaleString("vi-VN")}
            </span>
          </ListRow>
          <ListRow
            label={paid() ? t("account.manage") : t("nav.upgradePlan")}
            icon={<IconSparkles class="size-5" />}
            tone="accent"
            href="/pricing"
          />
        </ListGroup>

        <ListSection title={t("theme.title")}>
          <ListGroup>
            <div class="p-3">
              <Segmented
                label={t("theme.title")}
                block
                value={theme.colorScheme()}
                onChange={(scheme) => theme.setColorScheme(scheme)}
                options={[
                  { value: "system", label: t("theme.system"), icon: <IconAuto class="size-4" /> },
                  { value: "light", label: t("theme.light"), icon: <IconSun class="size-4" /> },
                  { value: "dark", label: t("theme.dark"), icon: <IconMoon class="size-4" /> },
                ]}
              />
            </div>
            <ListRow label={t("account.language")}>
              <Segmented
                label={t("account.language")}
                value={locale()}
                onChange={changeLocale}
                options={[
                  { value: "vi", label: "Tiếng Việt" },
                  { value: "en", label: "English" },
                ]}
              />
            </ListRow>
          </ListGroup>
        </ListSection>

        <Show when={orders()?.length}>
          <ListSection title={t("account.orders")}>
            <ListGroup>
              <For each={orders()}>
                {(o) => (
                  <ListRow
                    label={orderItem(o, t)}
                    detail={`${vnd(o.amountVnd)} · ${dateTime(o.createdAt)}`}
                    href={state(o) === "pending" ? `/pricing/checkout/${o.id}` : undefined}
                  >
                    <Tag tone={ORDER_TONES[state(o)]}>{t(`order.${state(o)}`)}</Tag>
                  </ListRow>
                )}
              </For>
            </ListGroup>
          </ListSection>
        </Show>

        <ListSection title={t("account.ledger")}>
          <ListGroup>
            <Show
              when={!ledger.loading}
              fallback={
                <div class="flex flex-col gap-3 p-4" aria-hidden="true">
                  <Skeleton class="h-4 w-full" />
                  <Skeleton class="h-4 w-5/6" />
                  <Skeleton class="h-4 w-4/6" />
                </div>
              }
            >
              <Show
                when={ledger()?.length}
                fallback={<p class="p-4 text-subhead text-label-2">{t("account.ledger.empty")}</p>}
              >
                <For each={ledger()?.slice(0, shown())}>
                  {(e) => (
                    <ListRow label={t(`ledger.${e.type}`)} detail={dateTime(e.createdAt)}>
                      <span class="flex flex-col items-end">
                        <span
                          class="text-callout font-semibold tabular-nums"
                          classList={{ "text-success": e.delta > 0, "text-label": e.delta < 0 }}
                        >
                          {e.delta > 0 ? `+${e.delta}` : e.delta}
                        </span>
                        <span class="text-caption text-label-2 tabular-nums">
                          {t("account.balance", { n: e.balanceAfter.toLocaleString("vi-VN") })}
                        </span>
                      </span>
                    </ListRow>
                  )}
                </For>
                <Show when={(ledger()?.length ?? 0) > shown()}>
                  <ListRow label={t("account.ledger.more")} tone="accent" onClick={() => setShown(shown() + 20)} />
                </Show>
              </Show>
            </Show>
          </ListGroup>
        </ListSection>

        <ListSection title={t("account.password")}>
          <ListGroup>
            <form
              class="flex flex-col gap-4 p-4"
              onSubmit={(event) => {
                event.preventDefault()
                void changePassword()
              }}
            >
              <TextField
                label={t("account.password.current")}
                type="password"
                value={current()}
                onChange={setCurrent}
                autocomplete="current-password"
                required
              />
              <TextField
                label={t("auth.newPassword")}
                type="password"
                value={next()}
                onChange={setNext}
                autocomplete="new-password"
                description={t("auth.signup.hint")}
                minLength={8}
                required
              />
              <div>
                <Button variant="secondary" type="submit" loading={busy()} disabled={!current() || next().length < 8}>
                  {t("account.password")}
                </Button>
              </div>
            </form>
          </ListGroup>
        </ListSection>

        <ListGroup>
          <ListRow
            label={t("nav.logout")}
            icon={<IconLogout class="size-5" />}
            tone="danger"
            onClick={() => void auth.logout().then(() => navigate("/login"))}
          />
        </ListGroup>
      </div>
    </Page>
  )
}
