import { isEditable } from "./shortcuts"

// Mobile Safari does not resize the layout when the keyboard opens; it pans the page instead, which
// pushes headers off screen. Pinning the app root to the visual viewport (see #root in
// components.css) keeps the top bar in place and the composer right above the keyboard. Android
// Chrome resizes the layout itself (interactive-widget=resizes-content), where this is a no-op.
// Returns a cleanup function.
export function trackViewport(onKeyboard: (open: boolean) => void) {
  const viewport = window.visualViewport
  if (!viewport) return () => {}
  const root = document.documentElement
  let baseline = viewport.height

  const update = () => {
    const editing = isEditable(document.activeElement)
    if (!editing) baseline = viewport.height
    // While pinch-zoomed the visual viewport is smaller than the screen on purpose; leave layout alone.
    const zoomed = Math.abs(viewport.scale - 1) > 0.01
    if (zoomed) {
      root.style.removeProperty("--app-height")
      root.style.removeProperty("--app-offset")
    }
    if (!zoomed) {
      root.style.setProperty("--app-height", `${viewport.height}px`)
      root.style.setProperty("--app-offset", `${viewport.offsetTop}px`)
    }
    const open = editing && !zoomed && baseline - viewport.height > 150
    root.dataset.keyboard = open ? "open" : ""
    onKeyboard(open)
  }
  const later = () => requestAnimationFrame(update)

  viewport.addEventListener("resize", update)
  viewport.addEventListener("scroll", update)
  document.addEventListener("focusin", later)
  document.addEventListener("focusout", later)
  update()
  return () => {
    viewport.removeEventListener("resize", update)
    viewport.removeEventListener("scroll", update)
    document.removeEventListener("focusin", later)
    document.removeEventListener("focusout", later)
  }
}
