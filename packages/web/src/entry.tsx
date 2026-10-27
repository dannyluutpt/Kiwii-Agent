// @refresh reload
import { render } from "solid-js/web"
import { App } from "@/app"
import "./index.css"

// Dark is the house default; the theme provider reads this key before first paint.
try {
  if (!localStorage.getItem("kiwii-color-scheme")) localStorage.setItem("kiwii-color-scheme", "dark")
} catch {}

render(() => <App />, document.getElementById("root")!)
