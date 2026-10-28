import { useLocation } from "@solidjs/router"
import { createEffect, createSignal, on, onCleanup } from "solid-js"
import { createSimpleContext } from "@kiwii/ui/context/helper"
import { createMediaQuery } from "@/lib/media"
import { trackViewport } from "@/lib/viewport"

const SIDEBAR_KEY = "kiwii-sidebar"

// Breakpoints: phones (< 768px) get the tab bar; from 1024px the sidebar is docked and can be
// collapsed; in between it opens as a drawer from the top bar.
export const { use: useLayout, provider: LayoutProvider } = createSimpleContext({
  name: "Layout",
  init: () => {
    const location = useLocation()
    const phone = createMediaQuery("(max-width: 47.99rem)")
    const wide = createMediaQuery("(min-width: 64rem)")
    const [keyboard, setKeyboard] = createSignal(false)
    const [drawer, setDrawer] = createSignal(false)
    const [collapsed, setCollapsed] = createSignal(read() === "collapsed")

    onCleanup(trackViewport(setKeyboard))
    // A link chosen in the drawer has done its job; close it once the route changes.
    createEffect(
      on(
        () => location.pathname,
        () => setDrawer(false),
        { defer: true },
      ),
    )
    createEffect(on(wide, () => setDrawer(false), { defer: true }))

    return {
      phone,
      keyboard,
      docked: wide,
      collapsed,
      // True when the sidebar is on screen without the person opening anything.
      sidebarVisible: () => wide() && !collapsed(),
      drawer,
      setDrawer,
      toggleSidebar: () => {
        if (!wide()) {
          setDrawer(!drawer())
          return
        }
        const next = !collapsed()
        setCollapsed(next)
        write(next ? "collapsed" : "open")
      },
    }
  },
})

function read() {
  try {
    return localStorage.getItem(SIDEBAR_KEY)
  } catch {
    return null
  }
}

function write(value: string) {
  try {
    localStorage.setItem(SIDEBAR_KEY, value)
  } catch {}
}
