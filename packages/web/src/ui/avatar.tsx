// Initial-letter avatar on the accent tint; decorative, so the name beside it carries the meaning.
export function Avatar(props: { name: string; class?: string }) {
  return (
    <span
      aria-hidden="true"
      class={`flex shrink-0 items-center justify-center rounded-full bg-accent-soft bg-amber-soft-gloss font-semibold text-accent uppercase shadow-tinted ${props.class ?? "size-8 text-subhead"}`}
    >
      {props.name.trim().slice(0, 1) || "?"}
    </span>
  )
}
