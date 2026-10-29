import { A, useNavigate } from "@solidjs/router"
import { createSignal, For, Match, Show, Switch } from "solid-js"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { projectPath, useProjects, type Project } from "@/context/projects"
import { fold, groupByDate } from "@/lib/projects"
import { SEARCH_SHORTCUT, shortcutLabel, SIDEBAR_SHORTCUT, useShortcut } from "@/lib/shortcuts"
import { Avatar } from "@/ui/avatar"
import { Button } from "@/ui/button"
import { IconButton, iconButtonClass } from "@/ui/icon-button"
import { Menu, MenuContent, MenuItem, MenuSeparator } from "@/ui/menu"
import { Skeleton } from "@/ui/skeleton"
import {
  IconClose,
  IconEllipsis,
  IconLibrary,
  IconLogout,
  IconPencil,
  IconPerson,
  IconPlus,
  IconSearch,
  IconSidebar,
  IconSparkles,
  IconStar,
  IconTrash,
} from "./icons"

const ROW =
  "flex h-9 items-center gap-3 rounded-[10px] px-2.5 text-callout transition-[color,background-color,box-shadow] duration-(--motion-micro) hover:bg-fill pointer-coarse:h-11"

// The workspace's left column: a new project, every project newest activity first, and the account.
// The same list renders docked on wide screens and inside the drawer elsewhere.
export function ProjectSidebar(props: { mode: "docked" | "drawer" }) {
  const { t } = useLanguage()
  const layout = useLayout()
  const projects = useProjects()
  return (
    <nav
      aria-label={t("nav.primary")}
      class="flex h-full w-full flex-col"
      classList={{
        "glass-panel overflow-hidden rounded-panel": props.mode === "docked",
        "bg-sidebar pt-safe": props.mode === "drawer",
      }}
    >
      <div class="flex h-[52px] shrink-0 items-center gap-1 pr-2 pl-3">
        <A href="/" class="flex items-center gap-2 rounded-[10px] px-1.5 py-1">
          <img src="/logo.svg" alt="" class="size-7 rounded-[8px] shadow-[0_0_16px_-2px_rgb(255_214_10/0.55)]" />
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

      <div class="flex shrink-0 flex-col gap-2 px-2 pt-1">
        <Button
          variant="primary"
          block
          leading={<IconPlus class="size-[18px]" weight={2.25} />}
          loading={projects.creating()}
          onClick={() => void projects.create()}
        >
          {t("projects.new")}
        </Button>
        <A
          href="/"
          end
          class={ROW}
          activeClass="bg-fill bg-gloss font-semibold text-label shadow-gloss [&_svg]:text-accent [&_svg]:drop-shadow-[0_0_6px_rgb(255_214_10/0.6)]"
          inactiveClass="text-label [&_svg]:text-label-2"
        >
          <IconLibrary class="size-5" />
          {t("projects.all")}
        </A>
      </div>

      <ProjectList />

      <div class="shrink-0 border-t border-separator p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <AccountMenu />
      </div>
    </nav>
  )
}

function ProjectList() {
  const { t } = useLanguage()
  const projects = useProjects()
  const [query, setQuery] = createSignal("")
  let search: HTMLInputElement | undefined
  useShortcut(SEARCH_SHORTCUT, () => search?.focus())
  const matches = () => {
    const needle = fold(query().trim())
    return (projects.list.latest ?? []).filter((p) => !needle || fold(projects.label(p)).includes(needle))
  }
  const groups = () => groupByDate(matches(), Date.now())
  return (
    <section class="mt-3 flex min-h-0 flex-1 flex-col" aria-label={t("projects.list")}>
      <div class="shrink-0 px-2 pb-2">
        <label class="flex h-9 items-center gap-2 rounded-[10px] bg-well px-2.5 text-label-2 shadow-well transition-shadow duration-(--motion-micro) focus-within:shadow-[var(--k-shadow-well),var(--k-shadow-focus)] pointer-coarse:h-10">
          <IconSearch class="size-4 shrink-0" />
          <input
            ref={search}
            type="search"
            value={query()}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              // First Escape clears the search; a second one reaches the drawer and closes it.
              if (event.key !== "Escape" || !query()) return
              event.stopPropagation()
              setQuery("")
            }}
            placeholder={t("nav.search")}
            aria-label={t("nav.search")}
            class="min-w-0 flex-1 bg-transparent text-subhead text-label outline-none placeholder:text-label-3 [&::-webkit-search-cancel-button]:hidden"
          />
          <kbd class="hidden font-sans text-caption text-label-3 pointer-fine:inline" aria-hidden="true">
            {shortcutLabel(SEARCH_SHORTCUT)}
          </kbd>
        </label>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-2" aria-busy={projects.list.loading}>
        <Switch>
          <Match when={projects.list.loading && !projects.list.latest}>
            <ul>
              <For each={["w-[72%]", "w-[56%]", "w-[84%]", "w-[64%]"]}>
                {(width) => (
                  <li class="flex h-9 items-center px-2.5">
                    <Skeleton class={`h-3.5 ${width}`} />
                  </li>
                )}
              </For>
            </ul>
          </Match>
          <Match when={projects.failed()}>
            <p class="flex flex-col items-start gap-1 px-3 py-2 text-footnote text-label-2">
              {t("projects.listFailed")}
              <button type="button" class="font-semibold text-accent" onClick={() => void projects.refetch()}>
                {t("common.retry")}
              </button>
            </p>
          </Match>
          <Match when={projects.list.latest?.length === 0}>
            <p class="px-3 py-2 text-footnote text-label-2">{t("projects.empty")}</p>
          </Match>
          <Match when={query().trim() && matches().length === 0}>
            <p class="px-3 py-2 text-footnote text-label-2">{t("nav.searchEmpty")}</p>
          </Match>
          <Match when={groups().length > 0}>
            <For each={groups()}>
              {(entry) => (
                <section class="pb-2" aria-label={t(`nav.group.${entry.group}`)}>
                  <h2 class="px-2.5 pt-2 pb-1 text-caption font-semibold text-label-2">
                    {t(`nav.group.${entry.group}`)}
                  </h2>
                  <ul>
                    <For each={entry.items}>{(project) => <ProjectRow project={project} />}</For>
                  </ul>
                </section>
              )}
            </For>
          </Match>
        </Switch>
      </div>
    </section>
  )
}

function ProjectRow(props: { project: Project }) {
  const { t } = useLanguage()
  const projects = useProjects()
  const label = () => projects.label(props.project)
  return (
    <li class="group/row relative">
      <A
        href={projectPath(props.project.id)}
        class="relative flex h-9 items-center rounded-[10px] pr-10 pl-2.5 text-callout transition-[color,background-color,box-shadow] duration-(--motion-micro) hover:bg-fill pointer-coarse:h-11"
        activeClass="bg-fill bg-gloss text-label shadow-gloss before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-accent before:shadow-[0_0_10px_rgb(255_214_10/0.8)]"
        inactiveClass="text-label-2 hover:text-label"
        aria-keyshortcuts="F2 Delete"
        onKeyDown={(event) => {
          if (event.key === "F2") {
            event.preventDefault()
            void projects.rename(props.project)
          }
          if (event.key === "Delete" || (event.key === "Backspace" && (event.metaKey || event.ctrlKey))) {
            event.preventDefault()
            void projects.remove(props.project)
          }
        }}
      >
        <span class="truncate" classList={{ "text-label-3": !props.project.name }}>
          {label()}
        </span>
      </A>
      <Menu placement="bottom-end" gutter={4}>
        {/* Positioned by a wrapper: the button itself stays `relative` for its touch hit area. */}
        <span class="absolute top-1/2 right-1 -translate-y-1/2 opacity-0 transition-opacity duration-(--motion-micro) group-hover/row:opacity-100 group-focus-within/row:opacity-100 has-[[data-expanded]]:opacity-100 pointer-coarse:opacity-100">
          <Menu.Trigger
            aria-label={t("projects.actions", { name: label() })}
            class={iconButtonClass("ghost", "sm", "pointer-coarse:text-label-3")}
          >
            <IconEllipsis class="size-[18px]" />
          </Menu.Trigger>
        </span>
        <MenuContent>
          <MenuItem icon={<IconPencil class="size-[18px]" />} onSelect={() => void projects.rename(props.project)}>
            {t("projects.rename")}
          </MenuItem>
          <MenuItem
            icon={<IconTrash class="size-[18px]" />}
            destructive
            onSelect={() => void projects.remove(props.project)}
          >
            {t("projects.delete")}
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
  )
}

function AccountMenu() {
  const { t } = useLanguage()
  const auth = useAuth()
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
              class="mb-1 flex items-center gap-3 rounded-[12px] bg-accent-soft bg-amber-soft-gloss px-3 py-2.5 text-subhead font-semibold text-accent shadow-tinted transition-[filter] hover:brightness-110"
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
