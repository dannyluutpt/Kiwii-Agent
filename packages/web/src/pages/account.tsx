import { A } from "@solidjs/router"
import { createResource, createSignal, For, Show } from "solid-js"
import { Button } from "@kiwii/ui/button"
import { showToast } from "@kiwii/ui/toast"
import { api, ApiError } from "@/api"
import { useAuth } from "@/context/auth"
import { useLanguage, type Locale } from "@/context/language"
import { Field } from "./auth/form"

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
  const [sub] = createResource(() => api<Subscription>("/billing/subscription"))
  const [ledger] = createResource(() => api<{ entries: Entry[] }>("/billing/ledger").then((r) => r.entries))
  const [current, setCurrent] = createSignal("")
  const [next, setNext] = createSignal("")
  const [busy, setBusy] = createSignal(false)

  const date = (ms: number) => new Date(ms).toLocaleDateString(locale() === "vi" ? "vi-VN" : "en-US")

  const changePassword = async () => {
    setBusy(true)
    try {
      await api("/account/password", { body: { current: current(), next: next() } })
      showToast({ title: t("account.password.done"), variant: "success" })
      setCurrent("")
      setNext("")
    } catch (error) {
      showToast({ title: error instanceof ApiError ? error.message : t("error.generic"), variant: "error" })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div class="flex-1 overflow-y-auto">
      <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-10">
        <h1 class="text-20-medium text-text-strong">{t("account.title")}</h1>

        <section class="flex flex-col gap-3 rounded-2xl border border-border-weak-base bg-surface-raised-base p-5">
          <div class="flex items-center justify-between">
            <span class="text-13-regular text-text-weak">{auth.me()?.user.email}</span>
            <select
              class="rounded-md border border-border-weak-base bg-surface-inset-base px-2 py-1 text-13-regular text-text-strong"
              value={locale()}
              onChange={(e) => {
                const value = e.currentTarget.value as Locale
                setLocale(value)
                void api("/account", { method: "PATCH", body: { locale: value } }).catch(() => {})
              }}
              aria-label={t("account.language")}
            >
              <option value="vi">Tiếng Việt</option>
              <option value="en">English</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="flex flex-col">
              <span class="text-12-regular text-text-weak">{t("account.plan")}</span>
              <span class="text-16-medium capitalize text-text-strong">
                {sub()?.tier === "free" ? t("plan.free") : sub()?.tier}
              </span>
              <Show when={sub()?.tierUntil}>
                <span class="text-12-regular text-text-weak">
                  {t("account.until", { date: date(sub()!.tierUntil!) })}
                </span>
              </Show>
            </div>
            <div class="flex flex-col">
              <span class="text-12-regular text-text-weak">{t("account.credits")}</span>
              <span class="text-16-medium text-text-strong">{sub()?.credits ?? 0}</span>
            </div>
          </div>
          <A href="/pricing" class="text-13-regular text-text-interactive-base">
            {t("nav.upgrade")} →
          </A>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-16-medium text-text-strong">{t("account.ledger")}</h2>
          <Show
            when={ledger()?.length}
            fallback={<p class="text-13-regular text-text-weak">{t("account.ledger.empty")}</p>}
          >
            <table class="w-full text-13-regular">
              <tbody>
                <For each={ledger()}>
                  {(e) => (
                    <tr class="border-t border-border-weak-base">
                      <td class="py-2 text-text-weak">{date(e.createdAt)}</td>
                      <td class="py-2 text-text-base">{t(`ledger.${e.type}`)}</td>
                      <td
                        class="py-2 text-right font-mono"
                        classList={{
                          "text-text-on-success-base": e.delta > 0,
                          "text-text-on-critical-base": e.delta < 0,
                        }}
                      >
                        {e.delta > 0 ? `+${e.delta}` : e.delta}
                      </td>
                      <td class="py-2 text-right font-mono text-text-weak">{e.balanceAfter}</td>
                    </tr>
                  )}
                </For>
              </tbody>
            </table>
          </Show>
        </section>

        <section class="flex flex-col gap-3">
          <h2 class="text-16-medium text-text-strong">{t("account.password")}</h2>
          <form
            class="flex max-w-sm flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault()
              void changePassword()
            }}
          >
            <Field
              label={t("account.password.current")}
              type="password"
              value={current()}
              onInput={setCurrent}
              autocomplete="current-password"
            />
            <Field
              label={t("auth.newPassword")}
              type="password"
              value={next()}
              onInput={setNext}
              autocomplete="new-password"
              hint={t("auth.signup.hint")}
            />
            <Button variant="secondary" type="submit" disabled={busy()}>
              {t("account.password")}
            </Button>
          </form>
        </section>
      </div>
    </div>
  )
}
