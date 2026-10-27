import { A, useNavigate } from "@solidjs/router"
import { createSignal } from "solid-js"
import { api } from "@/api"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { AuthForm, Field } from "./form"

export default function Login() {
  const { t } = useLanguage()
  const auth = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = createSignal("")
  const [password, setPassword] = createSignal("")

  return (
    <AuthForm
      title={t("auth.login.title")}
      submit={t("auth.login")}
      onSubmit={async () => {
        await api("/auth/login", { body: { email: email(), password: password() } })
        await auth.refresh()
        navigate("/chat")
      }}
      footer={
        <span class="flex flex-col gap-1">
          <span>
            {t("auth.login.noAccount")}{" "}
            <A href="/signup" class="text-text-interactive-base">
              {t("auth.signup")}
            </A>
          </span>
          <A href="/forgot" class="text-text-interactive-base">
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
    </AuthForm>
  )
}
