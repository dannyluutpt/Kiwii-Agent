import { Show, type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { shortcutLabel, SIDEBAR_SHORTCUT } from "@/lib/shortcuts"
import { IconButton } from "@/ui/icon-button"
import { IconSidebar } from "./icons"

// Toolbar at the top of every screen. Phones centre the title like a navigation bar (two equal side
// columns keep it centred, and a long title gives way to the buttons rather than running under
// them); wider screens align it left like a window toolbar. Without a `leading` slot it shows the
// sidebar button whenever the sidebar is not on screen, except on phones, where the tab bar already
// covers navigation.
export function TopBar(props: {
  title?: JSX.Element
  leading?: JSX.Element
  trailing?: JSX.Element
  // Pages with their own large heading fade the bar title in only once that heading scrolls away.
  titleHidden?: boolean
  // The bar title is the page heading (h1) when the page has no large heading of its own.
  heading?: boolean
}) {
  const { t } = useLanguage()
  const layout = useLayout()
  return (
    <header
      class="glass sticky top-0 z-(--z-topbar) shrink-0 pt-safe transition-shadow duration-(--motion-standard)"
      classList={{ "shadow-[inset_0_-0.5px_0_var(--k-separator-strong)]": !props.titleHidden }}
    >
      <div class="grid h-12 grid-cols-[1fr_minmax(0,auto)_1fr] items-center gap-1 px-2 md:flex lg:h-[52px] lg:px-3">
        <div class="flex shrink-0 items-center gap-1">
          <Show
            when={props.leading}
            fallback={
              <Show when={!layout.sidebarVisible() && !layout.phone()}>
                <IconButton
                  label={layout.docked() ? t("nav.showSidebar") : t("nav.menu")}
                  keys={layout.docked() ? shortcutLabel(SIDEBAR_SHORTCUT) : undefined}
                  icon={<IconSidebar />}
                  onClick={() => layout.toggleSidebar()}
                />
              </Show>
            }
          >
            {props.leading}
          </Show>
        </div>
        <Dynamic
          component={props.heading ? "h1" : "div"}
          class="min-w-0 truncate text-center text-headline text-label transition-opacity duration-(--motion-standard) md:flex-1 md:px-1 md:text-left"
          classList={{ "opacity-0": props.titleHidden }}
        >
          {props.title}
        </Dynamic>
        <div class="flex shrink-0 items-center justify-end gap-1">{props.trailing}</div>
      </div>
    </header>
  )
}
