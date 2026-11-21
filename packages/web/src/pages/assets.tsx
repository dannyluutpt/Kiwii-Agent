import { A, useNavigate } from "@solidjs/router"
import { createMemo, createSignal, For, onCleanup, onMount, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { api } from "@/api"
import { BRAND_SLUG } from "@/brand"
import { IconCheck, IconImage, IconPlay } from "@/components/icons"
import { Lightbox } from "@/components/lightbox"
import { LoadMore } from "@/components/load-more"
import { Page } from "@/components/page"
import { useCharacters } from "@/context/characters"
import { useLanguage } from "@/context/language"
import { useStudio } from "@/context/studio"
import { altFor, aspectStyle, thumbs } from "@/images"
import { errorMessage } from "@/lib/errors"
import { Button, buttonClass } from "@/ui/button"
import { askText } from "@/ui/confirm"
import { Skeleton } from "@/ui/skeleton"
import { toast } from "@/ui/toast"

type Asset = {
  id: string
  fileID: string
  generationID: string
  createdAt: number
  kind: "image" | "video"
  // Seconds, for a clip.
  duration: number | null
  model: string
  option: string
  aspectRatio: string
  prompt: string
  url: string
  // A character sheet, which saves as a character with its panels cut out.
  sheet: "character" | null
}

const PLACEHOLDER_RATIOS = ["1:1", "3:4", "4:3", "9:16", "1:1", "16:9", "3:4", "1:1", "2:3", "4:3", "1:1", "3:4"]

export default function Assets() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const characters = useCharacters()
  const studio = useStudio()
  const [list, setList] = createStore<{ items: Asset[]; cursor: string | null; loading: boolean; failed: boolean }>({
    items: [],
    cursor: null,
    loading: true,
    failed: false,
  })
  const [viewer, setViewer] = createSignal<number>()
  // Choosing several: a tap picks a tile instead of opening it.
  const [selecting, setSelecting] = createSignal(false)
  const [picked, setPicked] = createSignal<string[]>([])
  // Deleted a moment ago and still possible to bring back: off the screen, not yet off the server.
  const [leaving, setLeaving] = createSignal<string[]>([])
  const shown = createMemo(() => list.items.filter((asset) => !leaving().includes(asset.id)))
  const toggle = (id: string) =>
    setPicked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  const stopSelecting = () => {
    setSelecting(false)
    setPicked([])
  }

  // Each chosen file in turn; browsers refuse a burst of downloads started at once.
  const download = async () => {
    for (const asset of shown().filter((item) => picked().includes(item.id))) {
      const link = document.createElement("a")
      link.href = `${asset.url}?download`
      link.download = ""
      document.body.append(link)
      link.click()
      link.remove()
      await new Promise((resolve) => setTimeout(resolve, 400))
    }
    stopSelecting()
  }

  // Deleting takes the tiles away at once and waits six seconds before telling the server, so one tap
  // on "Hoàn tác" brings everything back. Leaving the page sends what is still waiting.
  const waiting = new Map<ReturnType<typeof setTimeout>, () => void>()
  const remove = () => {
    const ids = picked()
    if (ids.length === 0) return
    setLeaving((current) => [...current, ...ids])
    stopSelecting()
    const back = () => setLeaving((current) => current.filter((id) => !ids.includes(id)))
    const send = async () => {
      const gone = list.items.filter((asset) => ids.includes(asset.id))
      const results = await Promise.all(
        gone.map((asset) =>
          api(`/images/assets/${asset.id}`, { method: "DELETE" })
            .then(() => asset)
            .catch(() => undefined),
        ),
      )
      const done = results.flatMap((asset) => (asset ? [asset] : []))
      for (const asset of done) studio.forgetImage(asset.generationID, asset.id)
      setList(
        "items",
        list.items.filter((asset) => !done.some((item) => item.id === asset.id)),
      )
      back()
      if (done.length < gone.length) toast.error(t("assets.deleteFailed"))
    }
    const timer = setTimeout(() => {
      waiting.delete(timer)
      void send()
    }, 6000)
    waiting.set(timer, () => void send())
    toast.success(t("assets.deleted", { n: ids.length }), {
      duration: 6000,
      action: {
        label: t("assets.undo"),
        onClick: () => {
          clearTimeout(timer)
          waiting.delete(timer)
          back()
        },
      },
    })
  }
  onCleanup(() => {
    for (const [timer, send] of waiting) {
      clearTimeout(timer)
      send()
    }
  })

  const load = async (cursor?: string | null) => {
    setList({ loading: true, failed: false })
    await api<{ assets: Asset[]; nextCursor: string | null }>(
      `/images/assets?limit=40${cursor ? `&cursor=${cursor}` : ""}`,
    )
      .then((page) =>
        setList(
          produce((s) => {
            const known = new Set(s.items.map((a) => a.id))
            s.items.push(...page.assets.filter((a) => !known.has(a.id)))
            s.cursor = page.nextCursor
          }),
        ),
      )
      .catch((error: unknown) => {
        setList("failed", true)
        toast.error(errorMessage(error, t("error.network")))
      })
    setList("loading", false)
  }
  onMount(() => void load())

  const reuse = (asset: Asset) => {
    const query = new URLSearchParams({ prompt: asset.prompt, model: asset.model })
    if (asset.kind === "video") query.set("kind", "video")
    navigate(`/?${query}`)
  }

  // A character sheet left unsaved where it was made is saved from here, cut the same way. The
  // viewer closes first: the name is asked for in a dialog of its own.
  const saveSheet = async (asset: Asset) => {
    setViewer(undefined)
    const name = await askText({
      title: t("characters.create"),
      label: t("characters.name"),
      value: "",
      confirmLabel: t("common.save"),
      maxLength: 40,
    })
    if (!name) return
    const made = await characters.fromSheet(name, asset.fileID)
    if (!made) return
    toast.success(t("characters.saved", { name: made.name }), {
      action: {
        label: t("characters.use"),
        onClick: () => {
          characters.pick(made.id, studio.config.latest?.maxCharacters ?? 2)
          navigate("/")
        },
      },
    })
  }

  return (
    <Page
      title={t("assets.title")}
      width="wide"
      actions={
        <Show when={shown().length > 0}>
          <Button variant="ghost" size="sm" onClick={() => (selecting() ? stopSelecting() : setSelecting(true))}>
            {selecting() ? t("common.done") : t("assets.select")}
          </Button>
        </Show>
      }
    >
      <Show when={list.failed && !list.loading && list.items.length === 0}>
        <div class="flex flex-col items-center gap-3 py-16 text-center">
          <p class="text-callout text-label-2">{t("error.network")}</p>
          <Button variant="secondary" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        </div>
      </Show>
      <Show when={!list.loading && !list.failed && shown().length === 0}>
        <div class="flex flex-col items-center gap-3 py-16 text-center">
          <span class="flex size-14 items-center justify-center rounded-[16px] bg-amber-gloss text-on-accent shadow-amber">
            <IconImage class="size-7" />
          </span>
          <h2 class="text-title-2 text-label">{t("assets.emptyTitle")}</h2>
          <p class="max-w-sm text-callout text-label-2">{t("assets.empty")}</p>
          <A href="/" class={buttonClass("primary", "md", "mt-2")}>
            {t("images.generate")}
          </A>
        </div>
      </Show>
      <div class="columns-2 gap-2 md:columns-3 md:gap-3 lg:columns-4 xl:columns-5" aria-busy={list.loading}>
        <For each={shown()}>
          {(asset, index) => {
            const [loaded, setLoaded] = createSignal(false)
            const chosen = () => picked().includes(asset.id)
            return (
              <button
                type="button"
                class="group/asset rim relative mb-2 block w-full break-inside-avoid overflow-hidden rounded-[14px] bg-fill shadow-raised transition-[box-shadow,translate,scale] duration-(--motion-standard) ease-standard hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.98] md:mb-3"
                classList={{ "ring-3 ring-accent": chosen() }}
                style={aspectStyle(asset.aspectRatio)}
                aria-label={altFor(asset)}
                aria-pressed={selecting() ? chosen() : undefined}
                onClick={() => (selecting() ? toggle(asset.id) : setViewer(index()))}
              >
                <Show when={selecting()}>
                  <span
                    class="absolute top-2 left-2 z-10 flex size-7 items-center justify-center rounded-full border-2 border-white/90 shadow-raised"
                    classList={{ "bg-accent text-on-accent border-accent": chosen(), "bg-black/40": !chosen() }}
                    aria-hidden="true"
                  >
                    <Show when={chosen()}>
                      <IconCheck class="size-4" weight={3} />
                    </Show>
                  </span>
                </Show>
                <Show
                  when={asset.kind === "video"}
                  fallback={
                    <img
                      {...thumbs(asset.url, "(min-width: 1280px) 20vw, (min-width: 768px) 33vw, 50vw")}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      onLoad={() => setLoaded(true)}
                      class="size-full object-cover transition-[opacity,transform] duration-(--motion-standard) ease-standard group-hover/asset:scale-[1.02]"
                      classList={{ "opacity-0": !loaded() }}
                    />
                  }
                >
                  {/* "#t=0.1" makes iOS draw the clip's first frame instead of leaving it black. */}
                  <video
                    src={`${asset.url}#t=0.1`}
                    muted
                    playsinline
                    preload="metadata"
                    aria-hidden="true"
                    onLoadedMetadata={() => setLoaded(true)}
                    onError={() => setLoaded(true)}
                    class="size-full object-cover transition-[opacity,transform] duration-(--motion-standard) ease-standard group-hover/asset:scale-[1.02]"
                    classList={{ "opacity-0": !loaded() }}
                  />
                  <span class="pointer-events-none absolute right-2 bottom-2 flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-caption font-medium text-white backdrop-blur-sm">
                    <IconPlay class="size-3" weight={2.25} />
                    {asset.duration ? t("video.seconds", { n: asset.duration }) : ""}
                  </span>
                </Show>
              </button>
            )
          }}
        </For>
        <Show when={list.loading}>
          <For each={PLACEHOLDER_RATIOS}>
            {(ratio) => (
              <div class="mb-2 break-inside-avoid md:mb-3" style={aspectStyle(ratio)} aria-hidden="true">
                <Skeleton class="size-full rounded-[14px]" />
              </div>
            )}
          </For>
        </Show>
      </div>
      <Show when={selecting() && picked().length > 0}>
        <div
          role="toolbar"
          aria-label={t("assets.selected", { n: picked().length })}
          class="glass-panel fixed inset-x-3 bottom-[calc(var(--tabbar-space,0px)+0.75rem)] z-(--z-topbar) mx-auto flex max-w-md items-center gap-2 rounded-panel p-2 pl-4 shadow-overlay"
        >
          <span class="mr-auto text-subhead font-semibold text-label">
            {t("assets.selected", { n: picked().length })}
          </span>
          <Button variant="secondary" size="sm" onClick={() => void download()}>
            {t("images.download")}
          </Button>
          <Button variant="danger-soft" size="sm" onClick={remove}>
            {t("common.delete")}
          </Button>
        </div>
      </Show>
      <Show when={shown().length > 0}>
        <LoadMore
          more={!!list.cursor}
          loading={list.loading}
          failed={list.failed}
          onLoad={() => void load(list.cursor)}
        />
      </Show>
      <Lightbox
        items={shown().map((asset) => ({
          src: asset.url,
          alt: altFor(asset),
          caption: asset.prompt,
          download: `${asset.url}?download`,
          name: `${BRAND_SLUG}-${asset.id}`,
          video: asset.kind === "video",
          character: asset.sheet === "character",
        }))}
        index={viewer()}
        onIndex={setViewer}
        onClose={() => setViewer(undefined)}
        onReuse={(index) => {
          const asset = shown()[index]
          if (asset) reuse(asset)
        }}
        onCharacter={(index) => {
          const asset = shown()[index]
          if (asset) void saveSheet(asset)
        }}
        onNextScene={(index) => {
          const asset = shown()[index]
          if (asset) navigate(`/?next=${asset.generationID}`)
        }}
      />
    </Page>
  )
}
