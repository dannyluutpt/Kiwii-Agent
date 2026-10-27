import { A, useNavigate, useSearchParams } from "@solidjs/router"
import { createSignal } from "solid-js"
import { showToast } from "@kiwii/ui/toast"
import { api, ApiError } from "@/api"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { AuthForm, Field } from "./form"

export default function Verify() {
  const { t } = useLanguage()
  const auth = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams<{ email?: string }>()
  const email = () => (typeof params.email === "string" ? params.email : "")
  const [code, setCode] = createSignal("")

  const resend = () => {
    api("/auth/signup/resend", { body: { email: email() } })
      .then(() => showToast({ title: t("auth.verify.resent"), variant: "success" }))
      .catch((error: unknown) => {
        showToast({ title: error instanceof ApiError ? error.message : t("error.generic"), variant: "error" })
      })
  }

  return (
    <AuthForm
      title={t("auth.verify.title")}
      lead={t("auth.verify.lead", { email: email() })}
      submit={t("auth.verify.submit")}
      onSubmit={async () => {
        await api("/auth/signup/verify", { body: { email: email(), code: code() } })
        await auth.refresh()
        navigate("/chat")
      }}
      footer={
        <span class="flex flex-col gap-1">
          <button type="button" class="text-text-interactive-base" onClick={resend}>
            {t("auth.verify.resend")}
          </button>
          <A href="/login" class="text-text-weak">
            {t("auth.back")}
          </A>
        </span>
      }
    >
      <Field
        label={t("auth.code")}
        value={code()}
        onInput={(value) => setCode(value.replace(/\D/g, "").slice(0, 4))}
        inputMode="numeric"
        pattern="\d{4}"
        maxLength={4}
        autocomplete="one-time-code"
        autofocus
      />
    </AuthForm>
  )
}
