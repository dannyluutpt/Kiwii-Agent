import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { createEffect, createSignal, on, onMount, Show } from "solid-js"
import { BRAND_SLUG } from "@/brand"
import { FilterChips, type Filter } from "@/components/filter-chips"
import { Gallery } from "@/components/gallery"
import { Lightbox, type LightboxItem } from "@/components/lightbox"
import { StudioPanel } from "@/components/studio-panel"
import { StudioPromptBar } from "@/components/studio-prompt-bar"
import { TopBar } from "@/components/top-bar"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useProjects } from "@/context/projects"
import { ALL, useStudio } from "@/context/studio"
import { altFor, type Generation, type ModelsResponse } from "@/images"
import { Skeleton } from "@/ui/skeleton"

// The workspace. On wide screens: the gallery of one project (or of everything) in the middle and
// the panel that makes pictures on the right, the projects being in the sidebar. On phones: the
// gallery over a docked composer. A run shows up in the gallery the moment it is asked for,
// shimmering while the server prepares and renders it.
export default function Studio() {
  const { t } = useLanguage()
  const auth = useAuth()
  const layout = useLayout()
  const navigate = useNavigate()
  const projects = useProjects()
  const studio = useStudio()
  const params = useParams<{ projectId?: string }>()
  const [search, setSearch] = useSearchParams<{ prompt?: string; model?: string }>()
  const [viewer, setViewer] = createSignal<{ id: string; index: number }>()
  const [filter, setFilter] = createSignal<Filter>("all")
  let feed: HTMLDivElement | undefined

  const key = () => params.projectId ?? ALL
  const project = () => projects.find(params.projectId)
  const title = () => {
    const current = project()
    if (current) return projects.label(current)
    if (params.projectId) return ""
    return layout.phone() ? t("nav.images") : t("projects.all")
  }
  const items = () => studio.items(key())

  // The library's "use again" arrives with the prompt and model in the address.
  onMount(() => {
    if (search.prompt) studio.setPrompt(search.prompt)
    if (search.model) studio.patch({ model: search.model })
    if (search.prompt || search.model) setSearch({ prompt: undefined, model: undefined }, { replace: true })
    // Credits and the trial may have changed since the studio was last on screen.
    if (studio.config.state === "ready") void studio.refreshConfig()
  })

  createEffect(
    on(key, (current) => {
      setViewer(undefined)
      if (!studio.gallery(current)?.loaded) void studio.load(current)
    }),
  )

  // A deleted project, or a link to one that is not this account's, leads back to everything.
  createEffect(() => {
    if (params.projectId && projects.list.state === "ready" && !project()) navigate("/", { replace: true })
  })

  const generate = () => {
    feed?.scrollTo({ top: 0, behavior: "smooth" })
    void studio.generate(params.projectId)
  }

  const reuse = (g: Generation) => {
    studio.setPrompt(g.prompt)
    studio.patch({ model: g.model, option: g.option, aspectRatio: g.aspectRatio, n: g.n })
    setViewer(undefined)
    // The gallery is the scroller here, not the window; bring the prompt into view and focus it.
    if (layout.phone()) feed?.scrollTo({ top: 0, behavior: "smooth" })
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("[data-studio-prompt]")?.focus())
  }

  const opened = () => items().find((g) => g.id === viewer()?.id)
  const viewerItems = (): LightboxItem[] => {
    const g = opened()
    if (!g) return []
    return g.images
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((img) => ({
        src: img.url,
        alt: altFor(g),
        caption: g.prompt,
        download: `${img.url}?download`,
        name: `${BRAND_SLUG}-${img.id}`,
      }))
  }

  const controls = (cfg: ModelsResponse) => ({
    config: cfg,
    settings: studio.settings,
    onSettings: studio.patch,
    prompt: studio.prompt(),
    onPrompt: studio.setPrompt,
    references: studio.references(),
    onReferences: studio.setReferences,
    cost: studio.cost(),
    busy: studio.busy(),
    locked: studio.locked(),
    onGenerate: generate,
  })

  const gallery = (
    <div ref={feed} data-scroller class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <Gallery
        items={filter() === "all" || filter() === "images" ? items() : []}
        loading={studio.gallery(key())?.loading ?? true}
        more={!!studio.gallery(key())?.cursor}
        config={studio.config.latest}
        locked={studio.locked()}
        onLoadMore={() => void studio.load(key(), true)}
        onSuggest={(text) => {
          studio.setPrompt(text)
          document.querySelector<HTMLTextAreaElement>("[data-studio-prompt]")?.focus()
        }}
        onOpen={(g, index) => setViewer({ id: g.id, index })}
        onReuse={reuse}
        onRetry={(g) => void studio.generate(g.projectID ?? undefined, g)}
        onDelete={(g) => void studio.remove(g)}
      />
    </div>
  )

  return (
    <div class="flex h-full min-h-0 flex-col pb-tabbar">
      <Show
        when={!layout.phone()}
        fallback={
          <>
            <TopBar heading title={title()} />
            {gallery}
            <div class="px-3 pt-1 pb-3">
              <Show
                when={studio.config.latest}
                fallback={<Skeleton class="mx-auto h-[104px] w-full max-w-3xl rounded-panel" aria-hidden="true" />}
              >
                {(cfg) => <StudioPromptBar {...controls(cfg())} />}
              </Show>
            </div>
          </>
        }
      >
        <div class="flex min-h-0 flex-1">
          <div class="flex min-w-0 flex-1 flex-col">
            <TopBar heading title={title()} />
            <FilterChips value={filter()} onChange={setFilter} />
            {gallery}
          </div>
          <aside class="flex w-[360px] shrink-0 flex-col py-3 pr-3 xl:w-[400px]" aria-label={t("images.options")}>
            <div class="glass-panel flex min-h-0 flex-1 flex-col overflow-hidden rounded-panel">
              <div class="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-separator px-4">
                <h2 class="text-headline text-label">{t("images.generate")}</h2>
                <Show when={auth.me()}>
                  {(me) => (
                    <span class="rounded-full bg-accent-soft px-2.5 py-1 text-caption font-semibold text-accent tabular-nums">
                      {t("plan.credits", { credits: me().credits.toLocaleString("vi-VN") })}
                    </span>
                  )}
                </Show>
              </div>
              <Show
                when={studio.config.latest}
                fallback={
                  <div class="flex flex-col gap-4 p-4">
                    <Skeleton class="h-28 w-full rounded-[14px]" />
                    <Skeleton class="h-40 w-full rounded-[14px]" />
                    <Skeleton class="h-14 w-full rounded-[12px]" />
                  </div>
                }
              >
                {(cfg) => <StudioPanel {...controls(cfg())} />}
              </Show>
            </div>
          </aside>
        </div>
      </Show>
      <Lightbox
        items={viewerItems()}
        index={viewer()?.index}
        onIndex={(index) => setViewer((current) => current && { ...current, index })}
        onClose={() => setViewer(undefined)}
        onReuse={() => {
          const g = opened()
          if (g) reuse(g)
        }}
      />
    </div>
  )
}
