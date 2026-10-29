import { A, useNavigate } from "@solidjs/router"
import { Show, type JSX } from "solid-js"
import { useTheme } from "@kiwii/ui/theme/context"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { shortcutLabel, SIDEBAR_SHORTCUT } from "@/lib/shortcuts"
import { Avatar } from "@/ui/avatar"
import { IconButton } from "@/ui/icon-button"
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuSeparator } from "@/ui/menu"
import {
  IconAuto,
  IconClose,
  IconEllipsis,
  IconImage,
  IconLibrary,
  IconLogout,
  IconMoon,
  IconPerson,
  IconSidebar,
  IconSparkles,
  IconStar,
  IconSun,
} from "./icons"

const ROW =
  "flex h-9 items-center gap-3 rounded-[10px] px-2.5 text-callout transition-[color,background-color] duration-(--motion-micro) hover:bg-fill pointer-coarse:h-11"

// The same navigation renders docked on wide screens and inside the drawer elsewhere.
export function Sidebar(props: { mode: "docked" | "drawer" }) {
  const { t } = useLanguage()
  const layout = useLayout()
  return (
    <nav aria-label={t("nav.primary")} class="flex h-full w-full flex-col bg-sidebar pt-safe">
      <div class="flex h-[52px] shrink-0 items-center gap-1 pr-2 pl-3">
        <A href="/images" class="flex items-center gap-2 rounded-[10px] px-1.5 py-1">
          <img src="/logo.png" alt="" class="size-7 rounded-[8px]" />
          <span class="text-headline text-label">{t("app.name")}</span>
        </A>
        <span class="flex-1" />
        <IconButton
          label={props.mode === "docked" ? t("nav.hideSidebar") : t("common.close")}
          keys={props.mode === "docked" ? shortcutLabel(SIDEBAR_SHORTCUT) : undefined}
          icon={props.mode === "docked" ? <IconSidebar /> : <IconClose />}
          onClick={() => layout.toggleSidebar()}
        />
      </div>

      <div class="flex shrink-0 flex-col gap-0.5 px-2">
        <NavLink href="/images" end icon={<IconImage class="size-5" />} label={t("nav.images")} />
        <NavLink href="/images/assets" icon={<IconLibrary class="size-5" />} label={t("nav.assets")} />
      </div>

      <div class="flex-1" />

      <div class="shrink-0 border-t border-separator p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <AccountMenu />
      </div>
    </nav>
  )
}

function NavLink(props: { href: string; end?: boolean; icon: JSX.Element; label: string }) {
  return (
    <A
      href={props.href}
      end={props.end}
      class={`${ROW} group/nav`}
      activeClass="bg-fill-2 font-semibold text-label [&_svg]:text-accent"
      inactiveClass="text-label [&_svg]:text-label-2"
    >
      {props.icon}
      {props.label}
    </A>
  )
}

function AccountMenu() {
  const { t } = useLanguage()
  const auth = useAuth()
  const theme = useTheme()
  const navigate = useNavigate()
  const planLine = () => {
    const me = auth.me()
    if (!me) return ""
    return `${me.plan.name} · ${t("plan.credits", { credits: me.credits.toLocaleString("vi-VN") })}`
  }
  return (
    <Show when={auth.me()}>
      {(me) => (
        <>
          <Show when={me().tier === "free"}>
            <A
              href="/pricing"
              class="mb-1 flex items-center gap-3 rounded-[12px] bg-accent-soft px-3 py-2.5 text-subhead font-semibold text-accent transition-[filter] hover:brightness-105"
            >
              <IconSparkles class="size-5" />
              {t("nav.upgradePlan")}
            </A>
          </Show>
          <Menu placement="top-start" gutter={6} sameWidth>
            <Menu.Trigger class="flex w-full items-center gap-3 rounded-[12px] p-2 text-left transition-[color,background-color] hover:bg-fill data-[expanded]:bg-fill-2">
              <Avatar name={me().user.email} />
              <span class="min-w-0 flex-1">
                <span class="block truncate text-subhead font-medium text-label">{me().user.email}</span>
                <span class="block truncate text-caption text-label-2">{planLine()}</span>
              </span>
              <IconEllipsis class="size-5 text-label-3" />
            </Menu.Trigger>
            <MenuContent>
              <MenuItem icon={<IconPerson class="size-[18px]" />} onSelect={() => navigate("/account")}>
                {t("nav.account")}
              </MenuItem>
              <MenuItem icon={<IconStar class="size-[18px]" />} onSelect={() => navigate("/pricing")}>
                {t("nav.pricing")}
              </MenuItem>
              <MenuSeparator />
              <MenuRadioGroup
                label={t("theme.title")}
                value={theme.colorScheme()}
                onChange={(scheme) => theme.setColorScheme(scheme)}
                options={[
                  { value: "system", label: t("theme.system"), icon: <IconAuto class="size-[18px]" /> },
                  { value: "light", label: t("theme.light"), icon: <IconSun class="size-[18px]" /> },
                  { value: "dark", label: t("theme.dark"), icon: <IconMoon class="size-[18px]" /> },
                ]}
              />
              <MenuSeparator />
              <MenuItem
                icon={<IconLogout class="size-[18px]" />}
                onSelect={() => void auth.logout().then(() => navigate("/login"))}
              >
                {t("nav.logout")}
              </MenuItem>
            </MenuContent>
          </Menu>
        </>
      )}
    </Show>
  )
}
