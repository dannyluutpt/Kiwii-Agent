import { A } from "@solidjs/router"
import { Show, type JSX } from "solid-js"
import { IconChevronRight } from "@/components/icons"

// Inset grouped list, as in Settings: a small heading, a rounded group of rows split by hairlines,
// and an optional footnote under it.
export function ListSection(props: { title?: string; footer?: JSX.Element; children: JSX.Element }) {
  return (
    <section class="flex flex-col gap-2">
      <Show when={props.title}>
        <h2 class="px-4 text-footnote font-semibold text-label-2">{props.title}</h2>
      </Show>
      {props.children}
      <Show when={props.footer}>
        <p class="px-4 text-footnote text-label-2">{props.footer}</p>
      </Show>
    </section>
  )
}

export function ListGroup(props: { children: JSX.Element; class?: string }) {
  return (
    <div
      class={`overflow-hidden rounded-card bg-surface bg-sheen shadow-raised [&>*+*]:border-t [&>*+*]:border-separator ${props.class ?? ""}`}
    >
      {props.children}
    </div>
  )
}

const ROW = "flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left"

// One row: a label (with an optional second line) on the left, a value or control on the right.
// With `href` or `onClick` the whole row is the target and shows a chevron, like a Settings cell.
export function ListRow(props: {
  label: JSX.Element
  detail?: JSX.Element
  icon?: JSX.Element
  children?: JSX.Element
  href?: string
  onClick?: () => void
  tone?: "accent" | "danger"
}) {
  const color = () => (props.tone === "danger" ? "text-danger" : props.tone === "accent" ? "text-accent" : "text-label")
  const body = (chevron: boolean) => (
    <>
      <Show when={props.icon}>
        <span class={`flex size-5 shrink-0 items-center justify-center ${color()}`}>{props.icon}</span>
      </Show>
      <span class="flex min-w-0 flex-1 flex-col">
        <span class={`text-callout ${color()}`}>{props.label}</span>
        <Show when={props.detail}>
          <span class="text-footnote text-label-2">{props.detail}</span>
        </Show>
      </span>
      {props.children}
      <Show when={chevron}>
        <IconChevronRight class="size-4 shrink-0 text-label-3" />
      </Show>
    </>
  )
  return (
    <Show
      when={props.href}
      fallback={
        <Show when={props.onClick} fallback={<div class={ROW}>{body(false)}</div>}>
          <button
            type="button"
            class={`${ROW} transition-[background-color] duration-(--motion-micro) hover:bg-fill active:bg-fill-2`}
            onClick={() => props.onClick?.()}
          >
            {body(props.tone !== "danger")}
          </button>
        </Show>
      }
    >
      {(href) => (
        <A
          href={href()}
          class={`${ROW} transition-[background-color] duration-(--motion-micro) hover:bg-fill active:bg-fill-2`}
        >
          {body(true)}
        </A>
      )}
    </Show>
  )
}
