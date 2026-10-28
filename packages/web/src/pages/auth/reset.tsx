import { A, useNavigate, useSearchParams } from "@solidjs/router"
import { createSignal } from "solid-js"
import { api } from "@/api"
import { useLanguage } from "@/context/language"
import { AuthForm, Field } from "./form"
import { toast } from "@/ui/toast"

export default function Reset() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [params] = useSearchParams<{ email?: string }>()
  const [email, setEmail] = createSignal(typeof params.email === "string" ? params.email : "")
  const [code, setCode] = createSignal("")
  const [password, setPassword] = createSignal("")

  return (
    <AuthForm
      title={t("auth.reset.title")}
      submit={t("auth.reset.submit")}
      onSubmit={async () => {
        await api("/auth/reset", { body: { email: email(), code: code(), password: password() } })
        toast.success(t("auth.reset.done"))
        navigate("/login")
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
      />
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
      <Field
        label={t("auth.newPassword")}
        type="password"
        value={password()}
        onInput={setPassword}
        autocomplete="new-password"
        hint={t("auth.signup.hint")}
      />
    </AuthForm>
  )
}
