import { createSignal, onCleanup, onMount, Show, type JSX } from "solid-js"
import { TopBar } from "./top-bar"

const WIDTHS = {
  narrow: "max-w-2xl",
  content: "max-w-5xl",
  wide: "max-w-6xl",
}

// Scrolling screen with a large title, iOS style: the title sits in the content and moves into the
// top bar once it scrolls under it. One place owns page padding, widths and tab bar clearance.
export function Page(props: {
  title: string
  subtitle?: JSX.Element
  width?: keyof typeof WIDTHS
  align?: "left" | "center"
  leading?: JSX.Element
  actions?: JSX.Element
  children: JSX.Element
}) {
  const [scrolled, setScrolled] = createSignal(false)
  let scroller: HTMLDivElement | undefined
  let heading: HTMLHeadingElement | undefined

  onMount(() => {
    if (!scroller || !heading) return
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry?.isIntersecting), {
      root: scroller,
      rootMargin: "-56px 0px 0px 0px",
    })
    observer.observe(heading)
    onCleanup(() => observer.disconnect())
  })

  return (
    <div ref={scroller} class="h-full overflow-y-auto overscroll-contain pb-tabbar">
      <TopBar title={props.title} titleHidden={!scrolled()} leading={props.leading} trailing={props.actions} />
      <div class={`mx-auto w-full px-4 pb-12 md:px-6 ${WIDTHS[props.width ?? "content"]}`}>
        <header class="pt-1 pb-6 md:pt-4 md:pb-8" classList={{ "text-center": props.align === "center" }}>
          <h1 ref={heading} class="text-large-title text-label">
            {props.title}
          </h1>
          <Show when={props.subtitle}>
            <p class="mt-1.5 text-callout text-label-2">{props.subtitle}</p>
          </Show>
        </header>
        {props.children}
      </div>
    </div>
  )
}
