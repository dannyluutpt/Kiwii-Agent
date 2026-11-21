import { createEffect, createSignal, Show } from "solid-js"
import { api } from "@/api"
import { BRAND } from "@/brand"
import { SitePage } from "@/components/site"
import { Turnstile } from "@/components/turnstile"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { errorMessage } from "@/lib/errors"
import { Button } from "@/ui/button"
import { TextField, textareaClass } from "@/ui/text-field"

// Where a visitor or a customer writes to the people behind the product: a question, a refund, a
// request about their data. The message goes to the owner's inbox with the sender's address in it.
export default function Support() {
  const { t } = useLanguage()
  const auth = useAuth()
  const [email, setEmail] = createSignal("")
  const [message, setMessage] = createSignal("")
  const [turnstile, setTurnstile] = createSignal<string>()
  const [busy, setBusy] = createSignal(false)
  const [sent, setSent] = createSignal(false)
  const [error, setError] = createSignal<string>()
  createEffect(() => {
    document.title = `${t("support.title")} · ${BRAND}`
  })
  // A signed-in customer writes from the address of their account.
  createEffect(() => {
    const mine = auth.me()?.user.email
    if (mine && !email()) setEmail(mine)
  })
  const ready = () => email().includes("@") && message().trim().length >= 10
  const send = async () => {
    if (!ready() || busy()) return
    setBusy(true)
    setError(undefined)
    await api("/support", { body: { email: email(), message: message(), turnstile: turnstile() } })
      .then(() => setSent(true))
      .catch((cause: unknown) => setError(errorMessage(cause, t("error.network"))))
    setBusy(false)
  }
  return (
    <SitePage>
      <div class="mx-auto w-full max-w-xl px-4 pt-10 pb-16 md:px-6 md:pt-16">
        <header class="mb-8 flex flex-col gap-2">
          <h1 class="text-large-title text-label">{t("support.title")}</h1>
          <p class="text-body text-label-2">{t("support.lead")}</p>
        </header>
        <Show
          when={!sent()}
          fallback={
            <p role="status" class="rounded-card bg-surface p-5 text-callout text-label shadow-raised">
              {t("support.sent", { email: email() })}
            </p>
          }
        >
          <form
            class="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <TextField
              label={t("support.email")}
              type="email"
              autocomplete="email"
              inputMode="email"
              value={email()}
              onChange={setEmail}
              required
            />
            <label class="flex flex-col gap-1.5">
              <span class="text-subhead text-label-2">{t("support.message")}</span>
              <textarea
                class={`${textareaClass} min-h-40`}
                value={message()}
                maxLength={4000}
                placeholder={t("support.placeholder")}
                onInput={(event) => setMessage(event.currentTarget.value)}
                required
              />
            </label>
            <Turnstile onToken={setTurnstile} />
            <Show when={error()}>
              <p role="alert" class="text-subhead text-danger">
                {error()}
              </p>
            </Show>
            <Button type="submit" variant="primary" size="lg" disabled={!ready() || busy()}>
              {t("support.send")}
            </Button>
          </form>
        </Show>
      </div>
    </SitePage>
  )
}
