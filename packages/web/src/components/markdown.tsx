import DOMPurify from "dompurify"
import { createEffect, on, onCleanup } from "solid-js"
import { useMarked } from "@kiwii/ui/context/marked"
import { useLanguage } from "@/context/language"
import { fenceLanguages } from "@/lib/markdown"

// Renders markdown into innerHTML. Streaming text re-parses at most once per animation frame, and a
// stale async parse never overwrites a newer one. Code blocks get a header with their language and a
// copy button; wide tables scroll inside their own frame instead of widening the page.
export function Markdown(props: { text: string; class?: string }) {
  const marked = useMarked()
  const { t } = useLanguage()
  let ref: HTMLDivElement | undefined
  let frame: number | undefined
  let version = 0

  const render = async () => {
    const current = ++version
    const html = await marked.parse(props.text)
    if (current !== version || !ref) return
    ref.innerHTML = DOMPurify.sanitize(html, { ADD_ATTR: ["target"] })
    decorate(ref, fenceLanguages(props.text), t("chat.copyCode"))
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

  return (
    <div
      ref={ref}
      data-component="markdown"
      class={props.class}
      onClick={(event) => {
        const button = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-copy]") : null
        const code = button?.closest(".k-code")?.querySelector("pre")?.textContent
        if (!button || code === undefined || code === null) return
        void navigator.clipboard.writeText(code).then(() => {
          button.textContent = t("chat.copied")
          button.dataset.copied = ""
          setTimeout(() => {
            button.textContent = t("chat.copyCode")
            delete button.dataset.copied
          }, 1600)
        })
      }}
    />
  )
}

function decorate(root: HTMLElement, languages: string[], copyLabel: string) {
  root.querySelectorAll("pre").forEach((pre, index) => {
    const block = document.createElement("div")
    block.className = "k-code"
    const head = document.createElement("div")
    head.className = "k-code-head"
    const label = document.createElement("span")
    label.textContent = languages[index] || "code"
    const copy = document.createElement("button")
    copy.type = "button"
    copy.className = "k-code-copy"
    copy.dataset.copy = ""
    copy.textContent = copyLabel
    head.append(label, copy)
    pre.dataset.scrollable = ""
    pre.before(block)
    block.append(head, pre)
  })
  root.querySelectorAll("table").forEach((table) => {
    const frame = document.createElement("div")
    frame.className = "k-table"
    frame.dataset.scrollable = ""
    table.before(frame)
    frame.append(table)
  })
}
