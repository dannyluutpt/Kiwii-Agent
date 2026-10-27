import { A, useLocation, useNavigate } from "@solidjs/router"
import { For, Show, type JSX } from "solid-js"
import { DropdownMenu } from "@kiwii/ui/dropdown-menu"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"

const ChatIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4H6.5A2.5 2.5 0 0 1 4 13.5z" />
  </svg>
)
const ImageIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <circle cx="9" cy="10" r="1.8" />
    <path d="M20.5 15.5 15.5 11l-7 8" />
  </svg>
)
const AssetsIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </svg>
)
const PricingIcon = () => (
  <svg
    viewBox="0 0 24 24"
    width="18"
    height="18"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M12 3.5 14.6 9l6 .6-4.5 4.1 1.3 5.9L12 16.6 6.6 19.6l1.3-5.9L3.4 9.6l6-.6z" />
  </svg>
)

export function Sidebar() {
  const { t } = useLanguage()
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const items: Array<{ href: string; label: () => string; icon: () => JSX.Element; match: (path: string) => boolean }> =
    [
      { href: "/chat", label: () => t("nav.chat"), icon: ChatIcon, match: (p) => p.startsWith("/chat") },
      { href: "/images", label: () => t("nav.images"), icon: ImageIcon, match: (p) => p === "/images" },
      { href: "/images/assets", label: () => t("nav.assets"), icon: AssetsIcon, match: (p) => p === "/images/assets" },
      { href: "/pricing", label: () => t("nav.pricing"), icon: PricingIcon, match: (p) => p === "/pricing" },
    ]

  const initial = () => auth.me()?.user.email.slice(0, 1).toUpperCase() ?? "?"

  return (
    <nav class="flex h-full w-60 shrink-0 flex-col border-r border-border-weak-base bg-background-weak">
      <div class="flex items-center gap-2.5 px-4 pt-4 pb-3">
        <img src="/logo.png" alt="" class="size-7 rounded-md" />
        <span class="text-16-medium text-text-strong">{t("app.name")}</span>
      </div>
      <ul class="flex flex-col gap-0.5 px-2">
        <For each={items}>
          {(item) => (
            <li>
              <A
                href={item.href}
                class="flex items-center gap-2.5 rounded-md px-2.5 py-2 text-14-regular text-text-base hover:bg-surface-raised-base-hover hover:text-text-strong"
                classList={{ "bg-surface-raised-base text-text-strong": item.match(location.pathname) }}
              >
                <span class="text-icon-base">{item.icon()}</span>
                {item.label()}
              </A>
            </li>
          )}
        </For>
      </ul>
      <div class="flex-1" />
      <div class="border-t border-border-weak-base p-2">
        <Show when={auth.me()}>
          {(me) => (
            <DropdownMenu placement="top-start">
              <DropdownMenu.Trigger class="flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-surface-raised-base-hover">
                <span class="flex size-8 items-center justify-center rounded-full bg-surface-brand-base text-14-medium text-text-on-brand-base">
                  {initial()}
                </span>
                <span class="flex min-w-0 flex-col">
                  <span class="truncate text-14-medium text-text-strong">{me().user.email}</span>
                  <span class="text-12-regular text-text-weak">
                    {me().tier === "free"
                      ? t("plan.chatToday", { used: me().chatToday, limit: me().plan.chatDailyMessages ?? 0 })
                      : `${me().plan.name} · ${t("plan.credits", { credits: me().credits })}`}
                  </span>
                </span>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content>
                  <DropdownMenu.Item onSelect={() => navigate("/account")}>
                    <DropdownMenu.ItemLabel>{t("nav.account")}</DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                  <DropdownMenu.Item onSelect={() => navigate("/pricing")}>
                    <DropdownMenu.ItemLabel>{t("nav.upgrade")}</DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator />
                  <DropdownMenu.Item
                    onSelect={() => {
                      void auth.logout().then(() => navigate("/login"))
                    }}
                  >
                    <DropdownMenu.ItemLabel>{t("nav.logout")}</DropdownMenu.ItemLabel>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu>
          )}
        </Show>
      </div>
    </nav>
  )
}
