import { A, useNavigate, useSearchParams } from "@solidjs/router"
import { createSignal } from "solid-js"
import { api } from "@/api"
import { useLanguage } from "@/context/language"
import { withNext } from "@/lib/next"
import { Turnstile } from "@/components/turnstile"
import { AuthForm, Field } from "./form"

export default function Signup() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [search] = useSearchParams<{ next?: string }>()
  const [email, setEmail] = createSignal("")
  const [turnstile, setTurnstile] = createSignal<string>()
  const [password, setPassword] = createSignal("")

  return (
    <AuthForm
      title={t("auth.signup.title")}
      submit={t("auth.signup")}
      onSubmit={async () => {
        await api("/auth/signup", { body: { email: email(), password: password(), turnstile: turnstile() } })
        navigate(withNext(`/signup/verify?email=${encodeURIComponent(email().trim().toLowerCase())}`, search.next))
      }}
      footer={
        <span>
          {t("auth.signup.hasAccount")}{" "}
          <A href={withNext("/login", search.next)} class="font-medium text-accent">
            {t("auth.login")}
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
        autocomplete="new-password"
        hint={t("auth.signup.hint")}
      />
      <Turnstile onToken={setTurnstile} />
    </AuthForm>
  )
}
