import { createSignal, onCleanup } from "solid-js"

// What is left before a deadline, in the shape the screen shows it: hours and minutes while there is
// plenty of time, minutes within the hour, a ticking m:ss for the last ten minutes.
export type Remaining =
  | { kind: "expired" }
  | { kind: "hours"; hours: number; minutes: number }
  | { kind: "minutes"; minutes: number }
  | { kind: "clock"; text: string }

export function remaining(ms: number): Remaining {
  if (ms <= 0) return { kind: "expired" }
  const seconds = Math.ceil(ms / 1000)
  if (seconds <= 600) {
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return { kind: "clock", text: `${m}:${String(s).padStart(2, "0")}` }
  }
  const minutes = Math.ceil(seconds / 60)
  if (minutes < 60) return { kind: "minutes", minutes }
  return { kind: "hours", hours: Math.floor(minutes / 60), minutes: minutes % 60 }
}

// The current time, refreshed every `everyMs` while the calling component is mounted.
export function createNow(everyMs = 1000) {
  const [now, setNow] = createSignal(Date.now())
  const timer = setInterval(() => setNow(Date.now()), everyMs)
  onCleanup(() => clearInterval(timer))
  return now
}

// A wait between repeat actions, such as resending a code: `left()` counts down whole seconds.
export function createCooldown(seconds: number) {
  const now = createNow(1000)
  const [until, setUntil] = createSignal(0)
  return {
    left: () => Math.max(0, Math.ceil((until() - now()) / 1000)),
    start: () => setUntil(Date.now() + seconds * 1000),
  }
}
