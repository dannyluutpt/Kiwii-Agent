import { Tooltip as KTooltip } from "@kobalte/core/tooltip"
import { Show, splitProps, type ComponentProps, type JSX } from "solid-js"
import { tooltipContentClass, TooltipText } from "./tooltip"

export type IconButtonVariant = "ghost" | "filled" | "tinted" | "primary" | "overlay"
export type IconButtonSize = "xs" | "sm" | "md" | "lg" | "xl"

const VARIANTS: Record<IconButtonVariant, string> = {
  ghost:
    "text-label-2 hover:bg-fill hover:text-label active:bg-fill-2 data-[expanded]:bg-fill-2 data-[expanded]:text-label",
  filled: "bg-fill-2 text-label hover:bg-fill-3",
  tinted: "bg-accent-soft text-accent hover:brightness-105",
  primary: "bg-accent text-on-accent shadow-raised hover:bg-accent-hover",
  overlay: "bg-black/50 text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.1)] backdrop-blur-md hover:bg-black/65",
}

// Visual sizes stay compact (28 to 44px); on touch screens a transparent ::before widens the hit
// area of the smaller ones toward 44px. The button is `relative` for that, so position it with a
// wrapper rather than passing absolute/fixed classes.
const SIZES: Record<IconButtonSize, string> = {
  xs: "size-7 before:-inset-2",
  sm: "size-8 before:-inset-1.5",
  md: "size-9 before:-inset-1",
  lg: "size-10 before:-inset-0.5",
  xl: "size-11 before:inset-0",
}

const RADII: Record<IconButtonSize, string> = {
  xs: "rounded-[8px]",
  sm: "rounded-[9px]",
  md: "rounded-[10px]",
  lg: "rounded-[11px]",
  xl: "rounded-control",
}

export function iconButtonClass(
  variant: IconButtonVariant = "ghost",
  size: IconButtonSize = "md",
  extra?: string,
  circle?: boolean,
) {
  return [
    "relative inline-flex shrink-0 select-none items-center justify-center",
    "transition-[background-color,color,transform,filter] duration-(--motion-micro) ease-standard active:scale-[0.94]",
    "before:absolute before:content-[''] pointer-fine:before:hidden",
    "disabled:pointer-events-none disabled:opacity-40",
    VARIANTS[variant],
    SIZES[size],
    circle ? "rounded-full before:rounded-full" : RADII[size],
    extra ?? "",
  ].join(" ")
}

// `label` is required: it is the accessible name and, on pointer devices, the tooltip.
export function IconButton(
  props: ComponentProps<"button"> & {
    label: string
    icon: JSX.Element
    variant?: IconButtonVariant
    size?: IconButtonSize
    circle?: boolean
    tooltip?: boolean
    keys?: string
    placement?: "top" | "bottom" | "left" | "right"
  },
) {
  const [local, rest] = splitProps(props, [
    "label",
    "icon",
    "variant",
    "size",
    "circle",
    "tooltip",
    "keys",
    "placement",
    "class",
    "type",
  ])
  return (
    <Show
      when={local.tooltip !== false}
      fallback={
        <button
          {...rest}
          type={local.type ?? "button"}
          aria-label={local.label}
          class={iconButtonClass(local.variant, local.size, local.class, local.circle)}
        >
          {local.icon}
        </button>
      }
    >
      <KTooltip openDelay={500} closeDelay={0} gutter={6} placement={local.placement ?? "bottom"}>
        <KTooltip.Trigger
          {...rest}
          type={local.type ?? "button"}
          aria-label={local.label}
          class={iconButtonClass(local.variant, local.size, local.class, local.circle)}
        >
          {local.icon}
        </KTooltip.Trigger>
        <KTooltip.Portal>
          <KTooltip.Content class={tooltipContentClass}>
            <TooltipText label={local.label} keys={local.keys} />
          </KTooltip.Content>
        </KTooltip.Portal>
      </KTooltip>
    </Show>
  )
}
