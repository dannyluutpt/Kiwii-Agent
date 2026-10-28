import { A, useNavigate } from "@solidjs/router"
import { For, Match, Show, Switch, type JSX } from "solid-js"
import { useTheme } from "@kiwii/ui/theme/context"
import { useAuth } from "@/context/auth"
import { useConversations, type Conversation } from "@/context/conversations"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { NEW_CHAT_SHORTCUT, shortcutLabel, SIDEBAR_SHORTCUT } from "@/lib/shortcuts"
import { Avatar } from "@/ui/avatar"
import { IconButton, iconButtonClass } from "@/ui/icon-button"
import { Menu, MenuContent, MenuItem, MenuRadioGroup, MenuSeparator } from "@/ui/menu"
import { Skeleton } from "@/ui/skeleton"
import {
  IconAuto,
  IconChat,
  IconClose,
  IconCompose,
  IconEllipsis,
  IconImage,
  IconLibrary,
  IconLogout,
  IconMoon,
  IconPencil,
  IconPerson,
  IconSidebar,
  IconSparkles,
  IconStar,
  IconSun,
  IconTrash,
} from "./icons"

const ROW =
  "flex h-9 items-center gap-3 rounded-[10px] px-2.5 text-callout transition-[color,background-color] duration-(--motion-micro) hover:bg-fill pointer-coarse:h-11"

// The same navigation renders docked on wide screens and inside the drawer elsewhere.
export function Sidebar(props: { mode: "docked" | "drawer" }) {
  const { t } = useLanguage()
  const layout = useLayout()
  const navigate = useNavigate()
  return (
    <nav aria-label={t("nav.primary")} class="flex h-full w-full flex-col bg-sidebar pt-safe">
      <div class="flex h-[52px] shrink-0 items-center gap-1 pr-2 pl-3">
        <A href="/chat" class="flex items-center gap-2 rounded-[10px] px-1.5 py-1">
          <img src="/logo.png" alt="" class="size-7 rounded-[8px]" />
          <span class="text-headline text-label">{t("app.name")}</span>
        </A>
        <span class="flex-1" />
        <IconButton
          label={t("nav.newChat")}
          keys={shortcutLabel(NEW_CHAT_SHORTCUT)}
          icon={<IconCompose />}
          onClick={() => {
            navigate("/chat")
            layout.setDrawer(false)
          }}
        />
        <IconButton
          label={props.mode === "docked" ? t("nav.hideSidebar") : t("common.close")}
          keys={props.mode === "docked" ? shortcutLabel(SIDEBAR_SHORTCUT) : undefined}
          icon={props.mode === "docked" ? <IconSidebar /> : <IconClose />}
          onClick={() => layout.toggleSidebar()}
        />
      </div>

      <div class="flex shrink-0 flex-col gap-0.5 px-2">
        <NavLink href="/chat" icon={<IconChat class="size-5" />} label={t("nav.chat")} />
        <NavLink href="/images" end icon={<IconImage class="size-5" />} label={t("nav.images")} />
        <NavLink href="/images/assets" icon={<IconLibrary class="size-5" />} label={t("nav.assets")} />
      </div>

      <RecentConversations />

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

function RecentConversations() {
  const { t } = useLanguage()
  const conversations = useConversations()
  return (
    <section class="mt-5 flex min-h-0 flex-1 flex-col" aria-labelledby="sidebar-recent">
      <h2 id="sidebar-recent" class="shrink-0 px-5 pb-1.5 text-caption font-semibold text-label-2">
        {t("nav.recent")}
      </h2>
      <ul class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2" aria-busy={conversations.list.loading}>
        <Switch>
          <Match when={conversations.list.loading && !conversations.list.latest}>
            <For each={["w-[72%]", "w-[56%]", "w-[84%]", "w-[64%]", "w-[48%]"]}>
              {(width) => (
                <li class="flex h-9 items-center px-2.5">
                  <Skeleton class={`h-3.5 ${width}`} />
                </li>
              )}
            </For>
          </Match>
          <Match when={conversations.failed()}>
            <li class="flex flex-col items-start gap-1 px-3 py-2 text-footnote text-label-2">
              {t("chat.listFailed")}
              <button type="button" class="font-semibold text-accent" onClick={() => void conversations.refetch()}>
                {t("common.retry")}
              </button>
            </li>
          </Match>
          <Match when={conversations.list()?.length === 0}>
            <li class="px-3 py-2 text-footnote text-label-2">{t("chat.noConversations")}</li>
          </Match>
          <Match when={conversations.list()}>
            {(items) => <For each={items()}>{(conversation) => <ConversationRow conversation={conversation} />}</For>}
          </Match>
        </Switch>
      </ul>
    </section>
  )
}

function ConversationRow(props: { conversation: Conversation }) {
  const { t } = useLanguage()
  const conversations = useConversations()
  return (
    <li class="group/row relative">
      <A
        href={`/chat/${props.conversation.id}`}
        class="flex h-9 items-center rounded-[10px] pr-10 pl-2.5 text-callout transition-[color,background-color] duration-(--motion-micro) hover:bg-fill pointer-coarse:h-11"
        activeClass="bg-fill-2 text-label"
        inactiveClass="text-label-2 hover:text-label"
      >
        <span class="truncate">{props.conversation.title}</span>
      </A>
      <Menu placement="bottom-end" gutter={4}>
        {/* Positioned by a wrapper: the button itself stays `relative` for its touch hit area. */}
        <span class="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity duration-(--motion-micro) group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-[[data-expanded]]:opacity-100 pointer-coarse:opacity-100">
          <Menu.Trigger
            aria-label={t("chat.actions", { title: props.conversation.title })}
            class={iconButtonClass("ghost", "sm", "pointer-coarse:text-label-3")}
          >
            <IconEllipsis class="size-[18px]" />
          </Menu.Trigger>
        </span>
        <MenuContent>
          <MenuItem
            icon={<IconPencil class="size-[18px]" />}
            onSelect={() => void conversations.rename(props.conversation)}
          >
            {t("chat.rename")}
          </MenuItem>
          <MenuItem
            icon={<IconTrash class="size-[18px]" />}
            destructive
            onSelect={() => void conversations.remove(props.conversation)}
          >
            {t("chat.delete")}
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
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
    if (me.tier === "free") {
      return t("plan.chatToday", { used: me.chatToday, limit: me.plan.chatDailyMessages ?? 0 })
    }
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
