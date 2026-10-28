import { useNavigate } from "@solidjs/router"
import { Show, type ParentProps } from "solid-js"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { NEW_CHAT_SHORTCUT, SIDEBAR_SHORTCUT, useShortcut } from "@/lib/shortcuts"
import { Sheet } from "@/ui/sheet"
import { Sidebar } from "./sidebar"
import { TabBar } from "./tab-bar"

const SIDEBAR_WIDTH = 272

export function AppShell(props: ParentProps) {
  const { t } = useLanguage()
  const layout = useLayout()
  const navigate = useNavigate()

  useShortcut(NEW_CHAT_SHORTCUT, () => navigate("/chat"))
  useShortcut(SIDEBAR_SHORTCUT, () => layout.toggleSidebar())

  return (
    <div class="relative flex h-full overflow-hidden bg-canvas">
      <a
        href="#main"
        class="sr-only z-(--z-toast) rounded-control bg-elevated px-4 py-2 text-subhead font-semibold text-label shadow-floating focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("nav.skip")}
      </a>
      <Show when={layout.docked()}>
        <aside
          class="h-full shrink-0 overflow-hidden shadow-[inset_-0.5px_0_0_var(--k-separator-strong)] transition-[width] duration-(--motion-enter) ease-standard"
          style={{ width: `${layout.collapsed() ? 0 : SIDEBAR_WIDTH}px` }}
          inert={layout.collapsed() || undefined}
        >
          <div class="h-full" style={{ width: `${SIDEBAR_WIDTH}px` }}>
            <Sidebar mode="docked" />
          </div>
        </aside>
      </Show>
      <main
        id="main"
        class="relative flex min-w-0 flex-1 flex-col"
        style={{
          "--tabbar-space":
            layout.phone() && !layout.keyboard()
              ? "calc(var(--tabbar-height) + env(safe-area-inset-bottom, 0px))"
              : "0px",
        }}
      >
        {props.children}
      </main>
      <Show when={layout.phone()}>
        <TabBar />
      </Show>
      <Show when={!layout.docked()}>
        <Sheet open={layout.drawer()} onOpenChange={layout.setDrawer} side="left" label={t("nav.menu")}>
          <Sidebar mode="drawer" />
        </Sheet>
      </Show>
    </div>
  )
}
