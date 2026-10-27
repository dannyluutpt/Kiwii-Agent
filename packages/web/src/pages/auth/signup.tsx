import { A, useNavigate } from "@solidjs/router"
import { createSignal } from "solid-js"
import { api } from "@/api"
import { useLanguage } from "@/context/language"
import { Turnstile } from "@/components/turnstile"
import { AuthForm, Field } from "./form"

export default function Signup() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [email, setEmail] = createSignal("")
  const [turnstile, setTurnstile] = createSignal<string>()
  const [password, setPassword] = createSignal("")

  return (
    <AuthForm
      title={t("auth.signup.title")}
      submit={t("auth.signup")}
      onSubmit={async () => {
        await api("/auth/signup", { body: { email: email(), password: password(), turnstile: turnstile() } })
        navigate(`/signup/verify?email=${encodeURIComponent(email().trim().toLowerCase())}`)
      }}
      footer={
        <span>
          {t("auth.signup.hasAccount")}{" "}
          <A href="/login" class="text-text-interactive-base">
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
