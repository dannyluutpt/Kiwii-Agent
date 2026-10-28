import { Navigate, Route, Router, useLocation, useSearchParams } from "@solidjs/router"
import { lazy, Show, type ParentProps } from "solid-js"
import { MarkedProvider } from "@kiwii/ui/context/marked"
import { ThemeProvider } from "@kiwii/ui/theme/context"
import { AppShell } from "@/components/app-shell"
import { Splash } from "@/components/splash"
import { AuthProvider, useAuth } from "@/context/auth"
import { safeNext } from "@/lib/next"
import { ConversationsProvider } from "@/context/conversations"
import { LanguageProvider } from "@/context/language"
import { LayoutProvider } from "@/context/layout"
import { AuthLayout } from "@/pages/auth/layout"
import { ConfirmHost } from "@/ui/confirm"
import { ToastRegion } from "@/ui/toast"

const Login = lazy(() => import("@/pages/auth/login"))
const Signup = lazy(() => import("@/pages/auth/signup"))
const Verify = lazy(() => import("@/pages/auth/verify"))
const Forgot = lazy(() => import("@/pages/auth/forgot"))
const Reset = lazy(() => import("@/pages/auth/reset"))
const Chat = lazy(() => import("@/pages/chat"))
const Images = lazy(() => import("@/pages/images"))
const Assets = lazy(() => import("@/pages/assets"))
const Pricing = lazy(() => import("@/pages/pricing"))
const Checkout = lazy(() => import("@/pages/checkout"))
const Account = lazy(() => import("@/pages/account"))

// Browser chrome (status bar tint, overscroll) matches the canvas of the active scheme.
const CANVAS = { light: "#fbfbf9", dark: "#141513" }

function paintChrome(mode: "light" | "dark") {
  document.documentElement.style.backgroundColor = CANVAS[mode]
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", CANVAS[mode])
}

function Providers(props: ParentProps) {
  return (
    <ThemeProvider defaultTheme="kiwii" onThemeApplied={(_, mode) => paintChrome(mode)}>
      <LanguageProvider>
        <MarkedProvider>
          <AuthProvider>
            {props.children}
            <ToastRegion />
            <ConfirmHost />
          </AuthProvider>
        </MarkedProvider>
      </LanguageProvider>
    </ThemeProvider>
  )
}

function Private(props: ParentProps) {
  const auth = useAuth()
  const location = useLocation()
  return (
    <Show when={auth.ready() && !auth.failed()} fallback={<Splash failed={auth.failed()} onRetry={auth.refresh} />}>
      <Show
        when={auth.me()}
        fallback={<Navigate href={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} />}
      >
        <LayoutProvider>
          <ConversationsProvider>
            <AppShell>{props.children}</AppShell>
          </ConversationsProvider>
        </LayoutProvider>
      </Show>
    </Show>
  )
}

function Public(props: ParentProps) {
  const auth = useAuth()
  const [search] = useSearchParams<{ next?: string }>()
  return (
    <Show when={auth.ready() && !auth.failed()} fallback={<Splash failed={auth.failed()} onRetry={auth.refresh} />}>
      <Show when={!auth.me()} fallback={<Navigate href={safeNext(search.next)} />}>
        <AuthLayout>{props.children}</AuthLayout>
      </Show>
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
        <Route path="/images/assets" component={Assets} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/pricing/checkout/:orderId" component={Checkout} />
        <Route path="/account" component={Account} />
      </Route>
      <Route path="*" component={() => <Navigate href="/chat" />} />
    </Router>
  )
}
