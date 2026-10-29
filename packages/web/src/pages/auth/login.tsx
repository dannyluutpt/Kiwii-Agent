import { A, useNavigate, useSearchParams } from "@solidjs/router"
import { createSignal } from "solid-js"
import { api } from "@/api"
import { useAuth } from "@/context/auth"
import { safeNext, withNext } from "@/lib/next"
import { useLanguage } from "@/context/language"
import { Turnstile } from "@/components/turnstile"
import { AuthForm, Field } from "./form"

export default function Login() {
  const { t } = useLanguage()
  const auth = useAuth()
  const navigate = useNavigate()
  const [search] = useSearchParams<{ next?: string }>()
  const [email, setEmail] = createSignal("")
  const [turnstile, setTurnstile] = createSignal<string>()
  const [password, setPassword] = createSignal("")

  return (
    <AuthForm
      title={t("auth.login.title")}
      submit={t("auth.login")}
      onSubmit={async () => {
        await api("/auth/login", { body: { email: email(), password: password(), turnstile: turnstile() } })
        await auth.refresh()
        navigate(safeNext(search.next), { replace: true })
      }}
      footer={
        <span class="flex flex-col gap-1">
          <span>
            {t("auth.login.noAccount")}{" "}
            <A href={withNext("/signup", search.next)} class="font-medium text-accent">
              {t("auth.signup")}
            </A>
          </span>
          <A href="/forgot" class="font-medium text-accent">
            {t("auth.login.forgot")}
          </A>
        </span>
      }
    >
      <Field
        label={t("auth.email")}
        type="email"
        value={email()}
        onInput={setEmail}
        autocomplete="email"
        inputMode="email"
        autofocus
      />
      <Field
        label={t("auth.password")}
        type="password"
        value={password()}
        onInput={setPassword}
        autocomplete="current-password"
      />
      <Turnstile onToken={setTurnstile} />
    </AuthForm>
  )
}
