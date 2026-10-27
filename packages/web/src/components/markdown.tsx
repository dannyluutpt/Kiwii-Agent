import DOMPurify from "dompurify"
import { createEffect, on, onCleanup } from "solid-js"
import { useMarked } from "@kiwii/ui/context/marked"

// Renders markdown into innerHTML. Streaming text re-parses at most once per animation frame,
// and a stale async parse never overwrites a newer one.
export function Markdown(props: { text: string; class?: string }) {
  const marked = useMarked()
  let ref: HTMLDivElement | undefined
  let frame: number | undefined
  let version = 0

  const render = async () => {
    const current = ++version
    const html = await marked.parse(props.text)
    if (current !== version || !ref) return
    ref.innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ["target"] })
  }

  createEffect(
    on(
      () => props.text,
      () => {
        if (frame !== undefined) cancelAnimationFrame(frame)
        frame = requestAnimationFrame(() => {
          frame = undefined
          void render()
        })
      },
    ),
  )
  onCleanup(() => {
    if (frame !== undefined) cancelAnimationFrame(frame)
  })

  return <div ref={ref} data-component="markdown" class={props.class} />
}
