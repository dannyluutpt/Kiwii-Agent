import { createSignal, onCleanup } from "solid-js"

export function createMediaQuery(query: string) {
  const list = window.matchMedia(query)
  const [matches, setMatches] = createSignal(list.matches)
  const update = (event: MediaQueryListEvent) => setMatches(event.matches)
  list.addEventListener("change", update)
  onCleanup(() => list.removeEventListener("change", update))
  return matches
}
