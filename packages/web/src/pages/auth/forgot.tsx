import { A, useNavigate } from "@solidjs/router"
import { createSignal } from "solid-js"
import { showToast } from "@kiwii/ui/toast"
import { api } from "@/api"
import { useLanguage } from "@/context/language"
import { Turnstile } from "@/components/turnstile"
import { AuthForm, Field } from "./form"

export default function Forgot() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [email, setEmail] = createSignal("")
  const [turnstile, setTurnstile] = createSignal<string>()

  return (
    <AuthForm
      title={t("auth.forgot.title")}
      lead={t("auth.forgot.lead")}
      submit={t("auth.forgot.submit")}
      onSubmit={async () => {
        await api("/auth/forgot", { body: { email: email(), turnstile: turnstile() } })
        showToast({ title: t("auth.forgot.sent"), variant: "success" })
        navigate(`/reset?email=${encodeURIComponent(email().trim().toLowerCase())}`)
      }}
      footer={
        <A href="/login" class="text-text-weak">
          {t("auth.back")}
        </A>
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
      <Turnstile onToken={setTurnstile} />
    </AuthForm>
  )
}
