import { Navigate, Route, Router } from "@solidjs/router"
import { lazy, Show, type ParentProps } from "solid-js"
import { DialogProvider } from "@kiwii/ui/context/dialog"
import { MarkedProvider } from "@kiwii/ui/context/marked"
import { ThemeProvider } from "@kiwii/ui/theme/context"
import { Toast } from "@kiwii/ui/toast"
import { AppShell } from "@/components/app-shell"
import { AuthProvider, useAuth } from "@/context/auth"
import { LanguageProvider } from "@/context/language"
import { AuthLayout } from "@/pages/auth/layout"

const Login = lazy(() => import("@/pages/auth/login"))
const Signup = lazy(() => import("@/pages/auth/signup"))
const Verify = lazy(() => import("@/pages/auth/verify"))
const Forgot = lazy(() => import("@/pages/auth/forgot"))
const Reset = lazy(() => import("@/pages/auth/reset"))
const Chat = lazy(() => import("@/pages/chat"))
const Images = lazy(() => import("@/pages/images"))
const Pricing = lazy(() => import("@/pages/pricing"))
const Checkout = lazy(() => import("@/pages/checkout"))
const Account = lazy(() => import("@/pages/account"))

function Providers(props: ParentProps) {
  return (
    <ThemeProvider defaultTheme="kiwii">
      <LanguageProvider>
        <DialogProvider>
          <MarkedProvider>
            <AuthProvider>
              {props.children}
              <Toast.Region />
            </AuthProvider>
          </MarkedProvider>
        </DialogProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}

function Private(props: ParentProps) {
  const auth = useAuth()
  return (
    <Show when={auth.me()} fallback={<Navigate href="/login" />}>
      <AppShell>{props.children}</AppShell>
    </Show>
  )
}

function Public(props: ParentProps) {
  const auth = useAuth()
  return (
    <Show when={!auth.me()} fallback={<Navigate href="/chat" />}>
      <AuthLayout>{props.children}</AuthLayout>
    </Show>
  )
}

export function App() {
  return (
    <Router root={Providers}>
      <Route path="/" component={() => <Navigate href="/chat" />} />
      <Route component={Public}>
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/signup/verify" component={Verify} />
        <Route path="/forgot" component={Forgot} />
        <Route path="/reset" component={Reset} />
      </Route>
      <Route component={Private}>
        <Route path="/chat/:id?" component={Chat} />
        <Route path="/images" component={Images} />
        <Route path="/images/assets" component={Images} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/pricing/checkout/:orderId" component={Checkout} />
        <Route path="/account" component={Account} />
      </Route>
      <Route path="*" component={() => <Navigate href="/chat" />} />
    </Router>
  )
}
