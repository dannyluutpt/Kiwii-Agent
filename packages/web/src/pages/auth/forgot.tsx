import { A, useNavigate } from "@solidjs/router"
import { createSignal } from "solid-js"
import { showToast } from "@kiwii/ui/toast"
import { api } from "@/api"
import { useLanguage } from "@/context/language"
import { AuthForm, Field } from "./form"

export default function Forgot() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [email, setEmail] = createSignal("")

  return (
    <AuthForm
      title={t("auth.forgot.title")}
      lead={t("auth.forgot.lead")}
      submit={t("auth.forgot.submit")}
      onSubmit={async () => {
        await api("/auth/forgot", { body: { email: email() } })
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
    </AuthForm>
  )
}
