import { Show, splitProps, type ComponentProps, type JSX } from "solid-js"
import { Spinner } from "./spinner"

export type ButtonVariant = "primary" | "secondary" | "tinted" | "ghost" | "outline" | "danger" | "danger-soft"
export type ButtonSize = "sm" | "md" | "lg"

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent shadow-raised hover:bg-accent-hover",
  secondary: "bg-fill-2 text-label hover:bg-fill-3",
  tinted: "bg-accent-soft text-accent hover:bg-[color-mix(in_srgb,var(--k-accent-soft),var(--k-accent)_10%)]",
  ghost: "text-label hover:bg-fill active:bg-fill-2",
  outline: "text-label shadow-[inset_0_0_0_1px_var(--k-separator-strong)] hover:bg-fill",
  danger: "bg-danger text-on-danger hover:brightness-110",
  "danger-soft": "bg-danger-soft text-danger hover:bg-[color-mix(in_srgb,var(--k-danger-soft),var(--k-danger)_8%)]",
}

// Touch screens get 44px tall buttons, the minimum comfortable target; pointer devices keep a
// denser 32/40/48 scale.
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 px-3 text-subhead pointer-coarse:h-9",
  md: "h-10 gap-2 px-4 text-callout pointer-coarse:h-11",
  lg: "h-12 gap-2 px-5 text-headline",
}
const RADII: Record<ButtonSize, string> = { sm: "rounded-[10px]", md: "rounded-control", lg: "rounded-[14px]" }

// Shared so links (<A>) can look like buttons without nesting a <button> inside an <a>. Capsules
// (`pill`) sit among the rounded chips of a toolbar.
export function buttonClass(
  variant: ButtonVariant = "secondary",
  size: ButtonSize = "md",
  extra?: string,
  pill?: boolean,
) {
  return [
    "relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-semibold",
    "transition-[background-color,color,box-shadow,transform,filter,opacity] duration-(--motion-micro) ease-standard",
    // A loading button is disabled but keeps full opacity so the spinner reads as progress, not as off.
    "active:scale-[0.98] disabled:pointer-events-none [&:disabled:not([aria-busy=true])]:opacity-45",
    "aria-disabled:pointer-events-none aria-disabled:opacity-45",
    VARIANTS[variant],
    SIZES[size],
    pill ? "rounded-full" : RADII[size],
    extra ?? "",
  ].join(" ")
}

export function Button(
  props: ComponentProps<"button"> & {
    variant?: ButtonVariant
    size?: ButtonSize
    loading?: boolean
    block?: boolean
    pill?: boolean
    leading?: JSX.Element
    trailing?: JSX.Element
  },
) {
  const [local, rest] = splitProps(props, [
    "variant",
    "size",
    "loading",
    "block",
    "pill",
    "leading",
    "trailing",
    "class",
    "children",
    "disabled",
    "type",
  ])
  return (
    <button
      {...rest}
      type={local.type ?? "button"}
      disabled={local.disabled || local.loading}
      aria-busy={local.loading ? "true" : undefined}
      class={buttonClass(local.variant, local.size, `${local.block ? "w-full" : ""} ${local.class ?? ""}`, local.pill)}
    >
      <Show when={local.loading} fallback={local.leading}>
        <Spinner class="size-4" />
      </Show>
      {local.children}
      {local.trailing}
    </button>
  )
}
