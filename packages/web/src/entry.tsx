// @refresh reload
import { ErrorBoundary } from "solid-js"
import { render } from "solid-js/web"
import { App } from "@/app"
import { Splash } from "@/components/splash"
import "./index.css"

// A screen's file asked for after a deploy is gone (the server answers with the page instead), and the
// screen would stay blank: load the new version, once, so a real outage does not reload in a loop.
window.addEventListener("vite:preloadError", (event) => {
  if (sessionStorage.getItem("reloaded-for-version")) return
  event.preventDefault()
  sessionStorage.setItem("reloaded-for-version", "1")
  location.reload()
})

// Ten seconds in, this version is up: the next deploy may reload again.
setTimeout(() => sessionStorage.removeItem("reloaded-for-version"), 10_000)

// Whatever breaks while a screen renders (a request it cannot do without, a bug) lands on a screen that
// says so and offers to load again, instead of a blank page.
render(
  () => (
    <ErrorBoundary
      fallback={(error) => {
        console.error(error)
        return <Splash failed onRetry={() => location.reload()} />
      }}
    >
      <App />
    </ErrorBoundary>
  ),
  document.getElementById("root")!,
)
