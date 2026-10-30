import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { createEffect, createSignal, on, onMount, Show } from "solid-js"
import { api } from "@/api"
import { BRAND_SLUG } from "@/brand"
import { AssistantPanel } from "@/components/assistant-panel"
import { CharacterDialog } from "@/components/character-dialog"
import { CharacterGallery } from "@/components/characters"
import { FilterChips, type Filter } from "@/components/filter-chips"
import { Gallery } from "@/components/gallery"
import { Lightbox, type LightboxItem } from "@/components/lightbox"
import { StudioPromptBar } from "@/components/studio-prompt-bar"
import { TopBar } from "@/components/top-bar"
import { useCharacters } from "@/context/characters"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { useProjects } from "@/context/projects"
import { ALL, useStudio } from "@/context/studio"
import { altFor, type Generation, type GenerationImage, type ModelsResponse } from "@/images"
import { errorMessage } from "@/lib/errors"
import { Skeleton } from "@/ui/skeleton"
import { toast } from "@/ui/toast"

// The workspace. On wide screens: the gallery of one project (or of everything) in the middle and
// the image assistant on the right, the projects being in the sidebar. On phones: the gallery over a
// docked composer that makes pictures directly. A run shows up in the gallery the moment it starts,
// shimmering while the server prepares and renders it.
export default function Studio() {
  const { t } = useLanguage()
  const layout = useLayout()
  const navigate = useNavigate()
  const projects = useProjects()
  const studio = useStudio()
  const characters = useCharacters()
  const params = useParams<{ projectId?: string }>()
  const [search, setSearch] = useSearchParams<{ prompt?: string; model?: string; kind?: string; next?: string }>()
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
  // The gallery on screen: the project's, or only its pictures or only its clips.
  const shelf = () => (filter() === "images" ? `${key()}:image` : filter() === "videos" ? `${key()}:video` : key())
  const items = () => studio.items(shelf())

  // The library's "use again" arrives with the prompt, the model and, for a clip, its kind in the address.
  onMount(() => {
    if (search.prompt) studio.setPrompt(search.prompt)
    if (search.kind === "video") studio.setMode("video")
    if (search.model && search.kind === "video") studio.patchVideo({ model: search.model })
    if (search.model && search.kind !== "video") studio.patch({ model: search.model })
    // …and its "next scene" with the clip to start from.
    const next = search.next
    if (next) {
      void api<Generation>(`/images/generations/${next}`)
        .then((g) => continueFrom(g))
        .catch((error: unknown) => toast.error(errorMessage(error, t("error.network"))))
    }
    if (search.prompt || search.model || next)
      setSearch({ prompt: undefined, model: undefined, kind: undefined, next: undefined }, { replace: true })
    // Credits and the trial may have changed since the studio was last on screen.
    if (studio.config.state === "ready") void studio.refreshConfig()
  })

  createEffect(on(key, () => setViewer(undefined)))
  createEffect(
    on(shelf, (current) => {
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
    studio.setMode(g.kind)
    if (g.kind === "video") {
      studio.patchVideo({ model: g.model, option: g.option, aspectRatio: g.aspectRatio, duration: g.duration ?? 5 })
      // The pictures the clip started from and ended on come back with it.
      const frame = (id: string) => ({ id, url: `/api/images/files/${id}`, name: id, edge: 0 })
      studio.setReferences(g.referenceFileIDs.slice(0, 1).map(frame))
      studio.setLastFrame(g.lastFrameFileID ? frame(g.lastFrameFileID) : undefined)
    }
    if (g.kind !== "video") studio.patch({ model: g.model, option: g.option, aspectRatio: g.aspectRatio, n: g.n })
    setViewer(undefined)
    // The gallery is the scroller here, not the window; bring the prompt into view and focus it.
    if (layout.phone()) feed?.scrollTo({ top: 0, behavior: "smooth" })
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("[data-studio-prompt]")?.focus())
  }

  // The next clip starts from this one's last frame (or the frame `at` seconds in); the person then
  // writes what happens next.
  const continueFrom = (g: Generation, at?: number) => {
    setViewer(undefined)
    if (layout.phone()) feed?.scrollTo({ top: 0, behavior: "smooth" })
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("[data-studio-prompt]")?.focus())
    void studio.continueFrom(g, at)
  }

  // A character is saved from pictures the account made; the dialog shows them, to keep or take off.
  const maxCharacters = () => studio.config.latest?.maxCharacters ?? 2
  const sorted = (g: Generation) => g.images.slice().sort((a, b) => a.position - b.position)
  const photo = (image: GenerationImage) => ({
    id: image.fileID,
    url: image.url,
    name: `${BRAND_SLUG}-${image.id}`,
    edge: 0,
  })

  // A picture opens from the gallery or from the conversation, where older runs may not be listed.
  const opened = () => {
    const id = viewer()?.id
    return id ? studio.run(id) : undefined
  }
  const viewerItems = (): LightboxItem[] => {
    const g = opened()
    if (!g) return []
    return sorted(g).map((img) => ({
      src: img.url,
      alt: altFor(g),
      caption: g.prompt,
      download: `${img.url}?download`,
      name: `${BRAND_SLUG}-${img.id}`,
      video: g.kind === "video",
    }))
  }

  const controls = (cfg: ModelsResponse) => ({
    config: cfg,
    settings: studio.settings,
    onSettings: studio.patch,
    mode: studio.mode(),
    onMode: studio.setMode,
    videoConfig: studio.videoConfig.latest,
    video: studio.video,
    onVideo: studio.patchVideo,
    prompt: studio.prompt(),
    onPrompt: studio.setPrompt,
    references: studio.references(),
    onReferences: studio.setReferences,
    lastFrame: studio.lastFrame(),
    onLastFrame: studio.setLastFrame,
    framing: studio.framing(),
    cost: studio.cost(),
    busy: studio.busy(),
    locked: studio.mode() === "video" ? studio.videoLocked() : studio.locked(),
    onGenerate: generate,
  })

  const gallery = (
    <div ref={feed} data-scroller class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <Show
        when={filter() === "characters"}
        fallback={
          <Gallery
            items={items()}
            loading={studio.gallery(shelf())?.loading ?? true}
            more={!!studio.gallery(shelf())?.cursor}
            config={studio.config.latest}
            videoModels={studio.videoConfig.latest?.models}
            clipsOnly={filter() === "videos"}
            locked={studio.locked()}
            onLoadMore={() => void studio.load(shelf(), true)}
            onSuggest={(text) => {
              studio.setPrompt(text)
              document.querySelector<HTMLTextAreaElement>("[data-studio-prompt]")?.focus()
            }}
            onOpen={(g, index) => setViewer({ id: g.id, index })}
            onReuse={reuse}
            onRetry={(g) => void studio.generate(g.projectID ?? undefined, g)}
            onDelete={(g) => void studio.remove(g)}
            onCharacter={(g) => characters.compose(sorted(g).map(photo))}
            onNextScene={(g) => continueFrom(g)}
          />
        }
      >
        <CharacterGallery max={maxCharacters()} />
      </Show>
    </div>
  )

  return (
    <div class="flex h-full min-h-0 flex-col pb-tabbar">
      <Show
        when={!layout.phone()}
        fallback={
          <>
            <TopBar heading title={title()} />
            <FilterChips value={filter()} onChange={setFilter} />
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
          <aside class="flex w-[360px] shrink-0 flex-col py-3 pr-3 xl:w-[400px]">
            <AssistantPanel
              projectID={params.projectId}
              onOpen={(g, index) => setViewer({ id: g.id, index })}
              onMakeVideo={generate}
            />
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
        onCharacter={(index) => {
          const image = opened() && sorted(opened()!)[index]
          if (!image) return
          setViewer(undefined)
          characters.compose([photo(image)])
        }}
        onNextScene={(_index, at) => {
          const g = opened()
          if (g) continueFrom(g, at)
        }}
      />
      <CharacterDialog max={maxCharacters()} />
    </div>
  )
}
