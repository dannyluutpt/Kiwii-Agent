import { For } from "solid-js"

// Eight-spoke activity indicator. Pass `label` when the spinner is the only signal of progress so
// screen readers announce it; leave it out when surrounding text already says what is happening.
export function Spinner(props: { class?: string; label?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      class={`k-spinner shrink-0 ${props.class ?? "size-5"}`}
      role={props.label ? "status" : undefined}
      aria-label={props.label}
      aria-hidden={props.label ? undefined : "true"}
    >
      <For each={[0, 1, 2, 3, 4, 5, 6, 7]}>
        {(i) => (
          <rect
            x="11"
            y="2.5"
            width="2"
            height="5.5"
            rx="1"
            fill="currentColor"
            opacity={0.25 + (i / 7) * 0.75}
            transform={`rotate(${i * 45} 12 12)`}
          />
        )}
      </For>
    </svg>
  )
}
