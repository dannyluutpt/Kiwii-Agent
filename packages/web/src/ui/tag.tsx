import type { JSX } from "solid-js"

type Tone = "neutral" | "accent" | "success" | "warning" | "danger" | "info"

const TONES: Record<Tone, string> = {
  neutral: "bg-fill-2 text-label-2",
  accent: "bg-accent-soft bg-amber-soft-gloss text-accent shadow-tinted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
}

export function Tag(props: { tone?: Tone; children: JSX.Element; class?: string }) {
  return (
    <span
      class={`inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-caption font-semibold whitespace-nowrap ${TONES[props.tone ?? "neutral"]} ${props.class ?? ""}`}
    >
      {props.children}
    </span>
  )
}
