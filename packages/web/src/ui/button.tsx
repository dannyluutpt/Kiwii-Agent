import { Show, splitProps, type ComponentProps, type JSX } from "solid-js"
import { Spinner } from "./spinner"

export type ButtonVariant = "primary" | "secondary" | "tinted" | "ghost" | "outline" | "danger" | "danger-soft"
export type ButtonSize = "sm" | "md" | "lg"

// Raised and lit from above (theme.css, Depth): the primary is glossy amber that glows, secondary
// controls are glossy dark glass.
const VARIANTS: Record<ButtonVariant, string> = {
  // Faded, the yellow would turn olive on the dark canvas; off, it greys out, so yellow means ready.
  primary:
    "bg-amber-gloss text-on-accent shadow-amber hover:bg-amber-gloss-hover hover:shadow-amber-hover active:shadow-pressed off:bg-none off:bg-fill-2 off:text-label-3 off:shadow-none",
  secondary: "bg-fill bg-gloss text-label shadow-gloss hover:bg-gloss-hover",
  tinted: "bg-accent-soft bg-amber-soft-gloss text-accent shadow-tinted hover:brightness-110",
  ghost: "text-label hover:bg-fill active:bg-fill-2",
  outline: "text-label shadow-[inset_0_0_0_1px_var(--k-separator-strong)] hover:bg-fill",
  danger: "bg-danger bg-gloss text-on-danger shadow-gloss hover:brightness-110",
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
    "transition-[background-color,color,box-shadow,scale,filter,opacity] duration-(--motion-micro) ease-standard",
    "active:scale-[0.98] disabled:pointer-events-none aria-disabled:pointer-events-none",
    variant === "primary" ? "" : "off:opacity-45",
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
