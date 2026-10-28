import { createResource, createSignal, onCleanup, onMount, Show } from "solid-js"
import { useTheme } from "@kiwii/ui/theme/context"
import { api } from "@/api"

type TurnstileAPI = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string
  remove: (id: string) => void
}
declare global {
  interface Window {
    turnstile?: TurnstileAPI
  }
}

const config = api<{ turnstileSiteKey: string | null }>("/auth/config").catch(() => ({ turnstileSiteKey: null }))
let loader: Promise<TurnstileAPI | undefined> | undefined

function loadScript() {
  loader ??= new Promise((resolve) => {
    if (window.turnstile) return resolve(window.turnstile)
    const script = document.createElement("script")
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
    script.async = true
    script.onload = () => resolve(window.turnstile)
    script.onerror = () => resolve(undefined)
    document.head.appendChild(script)
  })
  return loader
}

// Renders Cloudflare Turnstile when the site key is configured, otherwise nothing. The token
// is handed to the form through `onToken` and reset when the widget expires.
export function Turnstile(props: { onToken: (token: string | undefined) => void }) {
  const [siteKey] = createResource(() => config.then((c) => c.turnstileSiteKey))
  return <Show when={siteKey()}>{(key) => <Widget siteKey={key()} onToken={props.onToken} />}</Show>
}

function Widget(props: { siteKey: string; onToken: (token: string | undefined) => void }) {
  const theme = useTheme()
  let el: HTMLDivElement | undefined
  const [id, setID] = createSignal<string>()
  onMount(() => {
    void loadScript().then((turnstile) => {
      if (!turnstile || !el) return
      setID(
        turnstile.render(el, {
          sitekey: props.siteKey,
          theme: theme.mode(),
          language: document.documentElement.lang || "vi",
          callback: (token: string) => props.onToken(token),
          "expired-callback": () => props.onToken(undefined),
          "error-callback": () => props.onToken(undefined),
        }),
      )
    })
  })
  onCleanup(() => {
    const current = id()
    if (current) window.turnstile?.remove(current)
  })
  return <div ref={el} class="min-h-[65px]" />
}
