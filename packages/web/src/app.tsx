import { Navigate, Route, Router, useLocation, useSearchParams } from "@solidjs/router"
import { lazy, onMount, Show, type ParentProps } from "solid-js"
import { AppShell } from "@/components/app-shell"
import { Splash } from "@/components/splash"
import { AssistantProvider } from "@/context/assistant"
import { AuthProvider, useAuth } from "@/context/auth"
import { safeNext } from "@/lib/next"
import { LanguageProvider } from "@/context/language"
import { LayoutProvider } from "@/context/layout"
import { ProjectsProvider } from "@/context/projects"
import { StudioProvider } from "@/context/studio"
// The sign-in screens are small and are the first thing a signed-out visitor sees, so they ship in
// the main bundle: the card renders whole instead of growing (and shifting) when a chunk lands.
import Forgot from "@/pages/auth/forgot"
import { AuthLayout } from "@/pages/auth/layout"
import Login from "@/pages/auth/login"
import Reset from "@/pages/auth/reset"
import Signup from "@/pages/auth/signup"
import Verify from "@/pages/auth/verify"
import { ConfirmHost } from "@/ui/confirm"
import { ToastRegion } from "@/ui/toast"

const Studio = lazy(() => import("@/pages/studio"))
const Assets = lazy(() => import("@/pages/assets"))
const Pricing = lazy(() => import("@/pages/pricing"))
const Checkout = lazy(() => import("@/pages/checkout"))
const Account = lazy(() => import("@/pages/account"))

function Providers(props: ParentProps) {
  return (
    <LanguageProvider>
      <AuthProvider>
        {props.children}
        <ToastRegion />
        <ConfirmHost />
      </AuthProvider>
    </LanguageProvider>
  )
}

// Once the first screen is up and the browser is idle, fetch the other screens so the next tap
// opens instantly. Skipped when the person asked the browser to save data.
function preloadScreens() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  if (connection?.saveData) return
  const run = () => {
    for (const screen of [Studio, Assets, Pricing, Account, Checkout]) void screen.preload()
  }
  // Safari has no requestIdleCallback; a short delay keeps the fetches clear of the first paint.
  const later =
    "requestIdleCallback" in window
      ? (fn: () => void) => requestIdleCallback(fn)
      : (fn: () => void) => setTimeout(fn, 1500)
  later(run)
}

function Private(props: ParentProps) {
  const auth = useAuth()
  const location = useLocation()
  onMount(preloadScreens)
  return (
    <Show when={auth.ready() && !auth.failed()} fallback={<Splash failed={auth.failed()} onRetry={auth.refresh} />}>
      <Show
        when={auth.me()}
        fallback={<Navigate href={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} />}
      >
        <LayoutProvider>
          <ProjectsProvider>
            <StudioProvider>
              <AssistantProvider>
                <AppShell>{props.children}</AppShell>
              </AssistantProvider>
            </StudioProvider>
          </ProjectsProvider>
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
      <Route component={Public}>
        <Route path="/login" component={Login} />
        <Route path="/signup" component={Signup} />
        <Route path="/signup/verify" component={Verify} />
        <Route path="/forgot" component={Forgot} />
        <Route path="/reset" component={Reset} />
      </Route>
      <Route component={Private}>
        <Route path="/" component={Studio} />
        <Route path="/p/:projectId" component={Studio} />
        <Route path="/library" component={Assets} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/pricing/checkout/:orderId" component={Checkout} />
        <Route path="/account" component={Account} />
      </Route>
      {/* Where the studio and the library used to live. */}
      <Route path="/images" component={() => <Navigate href="/" />} />
      <Route path="/images/assets" component={() => <Navigate href="/library" />} />
      {/* Also catches the retired /chat links, Home Screen icons that start there included. */}
      <Route path="*" component={() => <Navigate href="/" />} />
    </Router>
  )
}
