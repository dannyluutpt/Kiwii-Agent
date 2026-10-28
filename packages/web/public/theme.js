// Runs before first paint (a blocking script, since the CSP forbids inline ones) so the page opens in
// the right colour scheme instead of flashing. The ThemeProvider takes over once the app boots.
;(function () {
  try {
    // Builds before the appearance setting existed stored "dark" for everyone; that was never a
    // choice, so reset it once and let the system setting decide.
    if (!localStorage.getItem("kiwii-scheme-v2")) {
      localStorage.removeItem("kiwii-color-scheme")
      localStorage.setItem("kiwii-scheme-v2", "1")
    }
    var stored = localStorage.getItem("kiwii-color-scheme")
    var dark = stored === "dark" || (stored !== "light" && matchMedia("(prefers-color-scheme: dark)").matches)
    var root = document.documentElement
    root.dataset.theme = "kiwii"
    root.dataset.colorScheme = dark ? "dark" : "light"
    root.style.backgroundColor = dark ? "#141513" : "#fbfbf9"
    var meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute("content", dark ? "#141513" : "#fbfbf9")
  } catch {}
})()
