import { A, useNavigate } from "@solidjs/router"
import { createResource, createSignal, For, Show, type JSX } from "solid-js"
import { useTheme } from "@kiwii/ui/theme/context"
import { api } from "@/api"
import { IconAuto, IconChevronRight, IconLogout, IconMoon, IconSun } from "@/components/icons"
import { Page } from "@/components/page"
import { useAuth } from "@/context/auth"
import { useLanguage, type Locale } from "@/context/language"
import { errorMessage } from "@/lib/errors"
import { Avatar } from "@/ui/avatar"
import { Button } from "@/ui/button"
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

export default function Account() {
  const { t, locale, setLocale } = useLanguage()
  const auth = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()
  const [sub] = createResource(() => api<Subscription>("/billing/subscription"))
  const [ledger] = createResource(() => api<{ entries: Entry[] }>("/billing/ledger").then((r) => r.entries))
  const [current, setCurrent] = createSignal("")
  const [next, setNext] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  const date = (ms: number) => new Date(ms).toLocaleDateString(locale() === "vi" ? "vi-VN" : "en-US")

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
        <Group>
          <div class="flex items-center gap-4 p-4">
            <Avatar name={auth.me()?.user.email ?? ""} class="size-12 text-title-3" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-headline text-label">{auth.me()?.user.email}</p>
              <p class="text-footnote text-label-2">
                <Show when={sub()} fallback={<Skeleton class="mt-1 h-3 w-32" />}>
                  {(s) => (
                    <>
                      {s().tier === "free" ? t("plan.free") : auth.me()?.plan.name}
                      <Show when={s().tierUntil}>
                        {(until) => <> · {t("account.until", { date: date(until()) })}</>}
                      </Show>
                    </>
                  )}
                </Show>
              </p>
            </div>
          </div>
          <Row label={t("account.credits")}>
            <span class="text-headline text-label">
              {(sub()?.credits ?? auth.me()?.credits ?? 0).toLocaleString("vi-VN")}
            </span>
          </Row>
          <A
            href="/pricing"
            class="flex min-h-12 items-center justify-between gap-3 border-t border-separator px-4 text-callout text-accent hover:bg-fill"
          >
            {t("nav.upgradePlan")}
            <IconChevronRight class="size-4" />
          </A>
        </Group>

        <Section title={t("theme.title")}>
          <Group>
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
            <Row label={t("account.language")}>
              <Segmented
                label={t("account.language")}
                value={locale()}
                onChange={changeLocale}
                options={[
                  { value: "vi", label: "Tiếng Việt" },
                  { value: "en", label: "English" },
                ]}
              />
            </Row>
          </Group>
        </Section>

        <Section title={t("account.ledger")}>
          <Group>
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
                <ul>
                  <For each={ledger()}>
                    {(e) => (
                      <li class="flex items-center gap-3 border-t border-separator px-4 py-3 first:border-t-0">
                        <div class="min-w-0 flex-1">
                          <p class="text-callout text-label">{t(`ledger.${e.type}`)}</p>
                          <p class="text-caption text-label-2">{date(e.createdAt)}</p>
                        </div>
                        <Tag tone={e.delta > 0 ? "success" : e.delta < 0 ? "danger" : "neutral"} class="font-mono">
                          {e.delta > 0 ? `+${e.delta}` : e.delta}
                        </Tag>
                        <span class="w-14 text-right font-mono text-footnote text-label-2">{e.balanceAfter}</span>
                      </li>
                    )}
                  </For>
                </ul>
              </Show>
            </Show>
          </Group>
        </Section>

        <Section title={t("account.password")}>
          <Group>
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
                <Button variant="secondary" type="submit" loading={busy()}>
                  {t("account.password")}
                </Button>
              </div>
            </form>
          </Group>
        </Section>

        <Group>
          <button
            type="button"
            class="flex min-h-12 w-full items-center gap-3 px-4 text-callout text-danger hover:bg-fill"
            onClick={() => void auth.logout().then(() => navigate("/login"))}
          >
            <IconLogout class="size-5" />
            {t("nav.logout")}
          </button>
        </Group>
      </div>
    </Page>
  )
}

// Inset grouped list, as in Settings.
function Group(props: { children: JSX.Element }) {
  return <div class="overflow-hidden rounded-card bg-surface shadow-raised">{props.children}</div>
}

function Section(props: { title: string; children: JSX.Element }) {
  return (
    <section class="flex flex-col gap-2">
      <h2 class="px-4 text-footnote font-semibold text-label-2">{props.title}</h2>
      {props.children}
    </section>
  )
}

function Row(props: { label: string; children: JSX.Element }) {
  return (
    <div class="flex min-h-12 items-center justify-between gap-3 border-t border-separator px-4 py-2">
      <span class="text-callout text-label">{props.label}</span>
      {props.children}
    </div>
  )
}
