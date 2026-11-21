import { Navigate, Route, Router, useLocation, useSearchParams } from "@solidjs/router"
import { createEffect, lazy, Match, on, Show, Switch, type ParentProps } from "solid-js"
import { AppShell } from "@/components/app-shell"
import { Splash } from "@/components/splash"
import { AssistantProvider } from "@/context/assistant"
import { AuthProvider, useAuth } from "@/context/auth"
import { CharactersProvider } from "@/context/characters"
import { safeNext } from "@/lib/next"
import { BRAND } from "@/brand"
import { LanguageProvider, useLanguage } from "@/context/language"
import { LayoutProvider } from "@/context/layout"
import { LocationsProvider } from "@/context/locations"
import { ProjectsProvider } from "@/context/projects"
import { StudioProvider } from "@/context/studio"
// The sign-in screens are small and are the first thing a signed-out visitor sees, so they ship in
// the main bundle: the card renders whole instead of growing (and shifting) when a chunk lands.
import Forgot from "@/pages/auth/forgot"
// The public home page is what a new visitor sees first, so it ships in the main bundle too.
import Landing from "@/pages/landing"
import { AuthLayout } from "@/pages/auth/layout"
import Login from "@/pages/auth/login"
import Reset from "@/pages/auth/reset"
import Signup from "@/pages/auth/signup"
import Verify from "@/pages/auth/verify"
import { ConfirmHost } from "@/ui/confirm"
import { ToastRegion } from "@/ui/toast"

const Studio = lazy(() => import("@/pages/studio"))
const Assets = lazy(() => import("@/pages/assets"))
const Saved = lazy(() => import("@/pages/saved"))
const Templates = lazy(() => import("@/pages/templates"))
const Pricing = lazy(() => import("@/pages/pricing"))
const Checkout = lazy(() => import("@/pages/checkout"))
const Account = lazy(() => import("@/pages/account"))
const Support = lazy(() => import("@/pages/support"))
const Legal = lazy(() => import("@/pages/legal"))
const SitePricing = lazy(() => import("@/pages/site-pricing"))

// The tab's name follows the screen, so tabs, history and bookmarks tell the screens apart. The public
// pages keep the title the server wrote for them (packages/api/src/seo.ts).
const TITLES = [
  ["/library", "assets.title"],
  ["/templates", "templates.title"],
  ["/characters", "characters.title"],
  ["/locations", "locations.title"],
  ["/pricing", "nav.pricing"],
  ["/account", "account.title"],
  ["/login", "auth.login.title"],
  ["/signup/verify", "auth.verify.title"],
  ["/signup", "auth.signup.title"],
  ["/forgot", "auth.forgot.title"],
  ["/reset", "auth.reset.title"],
] as const

// The address the page was opened at and the title the server gave it.
const served = { path: location.pathname, title: document.title }

function Titles() {
  const location = useLocation()
  const auth = useAuth()
  const { t } = useLanguage()
  createEffect(() => {
    // A legal page names itself (pages/legal.tsx).
    if (["/terms", "/privacy", "/refund", "/support"].includes(location.pathname)) return
    const key = TITLES.find(([path]) => location.pathname.startsWith(path))?.[1]
    const guest = auth.ready() && !auth.me()
    if (guest && location.pathname === served.path && (served.path === "/" || served.path === "/pricing")) {
      document.title = served.title
      return
    }
    const name = key ? t(key) : auth.me() ? t("nav.images") : undefined
    document.title = name && !name.includes(BRAND) ? `${name} · ${BRAND}` : (name ?? BRAND)
  })
  return null
}

function Providers(props: ParentProps) {
  return (
    <LanguageProvider>
      <AuthProvider>
        <Titles />
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
    for (const screen of [Studio, Templates, Assets, Saved, Pricing, Account, Checkout]) void screen.preload()
  }
  // Safari has no requestIdleCallback; a short delay keeps the fetches clear of the first paint.
  const later =
    "requestIdleCallback" in window
      ? (fn: () => void) => requestIdleCallback(fn)
      : (fn: () => void) => setTimeout(fn, 1500)
  later(run)
}

// Whether this browser was signed in the last time it was here. The session cookie cannot be read
// from the page, so this is the hint that decides what shows while the session is being checked: the
// website at once for a visitor, the splash for someone about to get their studio.
const SIGNED_IN = "amberpix-signed-in"
const wasSignedIn = () => {
  try {
    return localStorage.getItem(SIGNED_IN) === "1"
  } catch {
    return false
  }
}

function Private(props: ParentProps) {
  const auth = useAuth()
  const location = useLocation()
  createEffect(() => {
    if (!auth.ready() || auth.failed()) return
    try {
      if (auth.me()) localStorage.setItem(SIGNED_IN, "1")
      else localStorage.removeItem(SIGNED_IN)
    } catch {}
  })
  // A first-time visitor reads the website while the session check is still on its way.
  const early = () => !auth.ready() && !wasSignedIn() && (location.pathname === "/" || location.pathname === "/pricing")
  createEffect(
    on(
      () => !!auth.me(),
      (signedIn) => signedIn && preloadScreens(),
    ),
  )
  // One branch holds the website from that first moment through "no session": it is not rebuilt, and
  // the visitor's scroll and playing clips stay, when the answer arrives.
  const guest = () => early() || (auth.ready() && !auth.failed() && !auth.me())
  return (
    <Switch fallback={<Splash failed={auth.failed()} onRetry={auth.refresh} />}>
      <Match when={guest()}>
        <Guest />
      </Match>
      <Match when={auth.ready() && !auth.failed() && auth.me()}>
        <LayoutProvider>
          <ProjectsProvider>
            <CharactersProvider>
              <LocationsProvider>
                <StudioProvider>
                  <AssistantProvider>
                    <AppShell>{props.children}</AppShell>
                  </AssistantProvider>
                </StudioProvider>
              </LocationsProvider>
            </CharactersProvider>
          </ProjectsProvider>
        </LayoutProvider>
      </Match>
    </Switch>
  )
}

// Signed out, the home page and the prices are the public website; any other screen asks to sign in
// and comes back after.
function Guest() {
  const location = useLocation()
  return (
    <Switch fallback={<Navigate href={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} />}>
      <Match when={location.pathname === "/"}>
        <Landing />
      </Match>
      <Match when={location.pathname === "/pricing"}>
        <SitePricing />
      </Match>
    </Switch>
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
        <Route path="/templates" component={Templates} />
        <Route path="/characters" component={Saved} />
        <Route path="/locations" component={Saved} />
        <Route path="/pricing" component={Pricing} />
        <Route path="/pricing/checkout/:orderId" component={Checkout} />
        <Route path="/account" component={Account} />
      </Route>
      {/* Read signed in or not. */}
      <Route path="/terms" component={Legal} />
      <Route path="/privacy" component={Legal} />
      <Route path="/refund" component={Legal} />
      <Route path="/support" component={Support} />
      {/* Where the studio and the library used to live. */}
      <Route path="/images" component={() => <Navigate href="/" />} />
      <Route path="/images/assets" component={() => <Navigate href="/library" />} />
      {/* Also catches the retired /chat links, Home Screen icons that start there included. */}
      <Route path="*" component={() => <Navigate href="/" />} />
    </Router>
  )
}
