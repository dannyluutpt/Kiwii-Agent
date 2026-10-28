import { onCleanup } from "solid-js"

export type Shortcut = { key: string; mod?: boolean; shift?: boolean; alt?: boolean }
type KeyLike = Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey" | "isComposing">

export const NEW_CHAT_SHORTCUT: Shortcut = { key: "o", mod: true, shift: true }
export const SIDEBAR_SHORTCUT: Shortcut = { key: "s", mod: true, shift: true }
export const SEARCH_SHORTCUT: Shortcut = { key: "k", mod: true }

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.userAgent)

// "Mod" is Command on Apple platforms and Control elsewhere; either one matches so a Mac user
// with an external PC keyboard still gets the shortcut.
export function matchShortcut(event: KeyLike, shortcut: Shortcut) {
  if (event.isComposing) return false
  if (event.key.toLowerCase() !== shortcut.key.toLowerCase()) return false
  if ((event.metaKey || event.ctrlKey) !== !!shortcut.mod) return false
  if (event.shiftKey !== !!shortcut.shift) return false
  return event.altKey === !!shortcut.alt
}

export function shortcutLabel(shortcut: Shortcut) {
  const parts = [
    shortcut.mod ? (isMac ? "⌘" : "Ctrl") : "",
    shortcut.shift ? (isMac ? "⇧" : "Shift") : "",
    shortcut.alt ? (isMac ? "⌥" : "Alt") : "",
    shortcut.key.length === 1 ? shortcut.key.toUpperCase() : shortcut.key,
  ].filter(Boolean)
  return parts.join(isMac ? "" : "+")
}

export function isEditable(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
}

// Global keyboard shortcut for the lifetime of the calling component. Shortcuts without a modifier
// stay quiet while the person is typing.
export function useShortcut(shortcut: Shortcut, handler: (event: KeyboardEvent) => void) {
  const onKey = (event: KeyboardEvent) => {
    if (!matchShortcut(event, shortcut)) return
    if (!shortcut.mod && isEditable(event.target)) return
    event.preventDefault()
    handler(event)
  }
  document.addEventListener("keydown", onKey)
  onCleanup(() => document.removeEventListener("keydown", onKey))
}
