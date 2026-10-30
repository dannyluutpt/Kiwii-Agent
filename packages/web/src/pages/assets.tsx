import { A, useNavigate } from "@solidjs/router"
import { createSignal, For, onMount, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { api } from "@/api"
import { BRAND_SLUG } from "@/brand"
import { IconImage, IconPlay } from "@/components/icons"
import { Lightbox } from "@/components/lightbox"
import { LoadMore } from "@/components/load-more"
import { Page } from "@/components/page"
import { useLanguage } from "@/context/language"
import { altFor, aspectStyle } from "@/images"
import { errorMessage } from "@/lib/errors"
import { buttonClass } from "@/ui/button"
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
}

const PLACEHOLDER_RATIOS = ["1:1", "3:4", "4:3", "9:16", "1:1", "16:9", "3:4", "1:1", "2:3", "4:3", "1:1", "3:4"]

export default function Assets() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [list, setList] = createStore<{ items: Asset[]; cursor: string | null; loading: boolean }>({
    items: [],
    cursor: null,
    loading: true,
  })
  const [viewer, setViewer] = createSignal<number>()

  const load = async (cursor?: string | null) => {
    setList("loading", true)
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
      .catch((error: unknown) => toast.error(errorMessage(error, t("error.network"))))
    setList("loading", false)
  }
  onMount(() => void load())

  const reuse = (asset: Asset) => {
    const query = new URLSearchParams({ prompt: asset.prompt, model: asset.model })
    if (asset.kind === "video") query.set("kind", "video")
    navigate(`/?${query}`)
  }

  return (
    <Page title={t("assets.title")} width="wide">
      <Show when={!list.loading && list.items.length === 0}>
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
        <For each={list.items}>
          {(asset, index) => {
            const [loaded, setLoaded] = createSignal(false)
            return (
              <button
                type="button"
                class="group/asset rim relative mb-2 block w-full break-inside-avoid overflow-hidden rounded-[14px] bg-fill shadow-raised transition-[box-shadow,translate,scale] duration-(--motion-standard) ease-standard hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.98] md:mb-3"
                style={aspectStyle(asset.aspectRatio)}
                aria-label={altFor(asset)}
                onClick={() => setViewer(index())}
              >
                <Show
                  when={asset.kind === "video"}
                  fallback={
                    <img
                      src={asset.url}
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
      <Show when={list.items.length > 0}>
        <LoadMore more={!!list.cursor} loading={list.loading} onLoad={() => void load(list.cursor)} />
      </Show>
      <Lightbox
        items={list.items.map((asset) => ({
          src: asset.url,
          alt: altFor(asset),
          caption: asset.prompt,
          download: `${asset.url}?download`,
          name: `${BRAND_SLUG}-${asset.id}`,
          video: asset.kind === "video",
        }))}
        index={viewer()}
        onIndex={setViewer}
        onClose={() => setViewer(undefined)}
        onReuse={(index) => {
          const asset = list.items[index]
          if (asset) reuse(asset)
        }}
        onNextScene={(index) => {
          const asset = list.items[index]
          if (asset) navigate(`/?next=${asset.generationID}`)
        }}
      />
    </Page>
  )
}
