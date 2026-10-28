import { A, useNavigate } from "@solidjs/router"
import { createSignal } from "solid-js"
import { api } from "@/api"
import { useLanguage } from "@/context/language"
import { Turnstile } from "@/components/turnstile"
import { AuthForm, Field } from "./form"
import { toast } from "@/ui/toast"

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
        toast.success(t("auth.forgot.sent"))
        navigate(`/reset?email=${encodeURIComponent(email().trim().toLowerCase())}`)
      }}
      footer={
        <A href="/login" class="text-label-2">
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
