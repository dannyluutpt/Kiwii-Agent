// A frame drawn in the given aspect ratio, so "16:9" and "9:16" read at a glance before the numbers.
export function AspectIcon(props: { ratio: string; class?: string }) {
  const size = () => {
    const [w = 1, h = 1] = props.ratio.split(":").map(Number)
    const scale = 16 / Math.max(w, h)
    return { width: w * scale, height: h * scale }
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" class={props.class ?? "size-5"} aria-hidden="true">
      <rect
        x={12 - size().width / 2}
        y={12 - size().height / 2}
        width={size().width}
        height={size().height}
        rx="2.5"
        stroke="currentColor"
        stroke-width="1.75"
      />
    </svg>
  )
}
