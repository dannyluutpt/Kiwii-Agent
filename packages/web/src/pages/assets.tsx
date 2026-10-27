import { useNavigate } from "@solidjs/router"
import { createSignal, For, onMount, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Button } from "@kiwii/ui/button"
import { Spinner } from "@kiwii/ui/spinner"
import { showToast } from "@kiwii/ui/toast"
import { api, ApiError } from "@/api"
import { Lightbox } from "@/components/lightbox"
import { useLanguage } from "@/context/language"
import { aspectStyle } from "@/images"

type Asset = {
  id: string
  fileID: string
  generationID: string
  createdAt: number
  model: string
  option: string
  aspectRatio: string
  prompt: string
  promptEnhanced: string | null
  url: string
}

export default function Assets() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [list, setList] = createStore<{ items: Asset[]; cursor: string | null; loading: boolean }>({
    items: [],
    cursor: null,
    loading: true,
  })
  const [open, setOpen] = createSignal<Asset>()

  const load = async (cursor?: string | null) => {
    setList("loading", true)
    try {
      const page = await api<{ assets: Asset[]; nextCursor: string | null }>(
        `/images/assets?limit=40${cursor ? `&cursor=${cursor}` : ""}`,
      )
      setList(
        produce((s) => {
          s.items.push(...page.assets)
          s.cursor = page.nextCursor
        }),
      )
    } catch (error) {
      showToast({ title: error instanceof ApiError ? error.message : t("error.network"), variant: "error" })
    } finally {
      setList("loading", false)
    }
  }
  onMount(() => void load())

  const reuse = (asset: Asset) => {
    navigate(`/images?prompt=${encodeURIComponent(asset.prompt)}&model=${encodeURIComponent(asset.model)}`)
  }

  return (
    <div class="h-full overflow-y-auto">
      <div class="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-6">
        <h1 class="text-20-medium text-text-strong">{t("assets.title")}</h1>
        <Show when={!list.loading && list.items.length === 0}>
          <p class="py-20 text-center text-14-regular text-text-weak">{t("assets.empty")}</p>
        </Show>
        <div class="columns-2 gap-3 md:columns-3 lg:columns-4">
          <For each={list.items}>
            {(asset) => (
              <button
                type="button"
                class="group/asset mb-3 block w-full overflow-hidden rounded-xl bg-surface-raised-base"
                style={aspectStyle(asset.aspectRatio)}
                onClick={() => setOpen(asset)}
              >
                <img
                  src={asset.url}
                  alt=""
                  loading="lazy"
                  class="size-full object-cover transition-transform group-hover/asset:scale-[1.02]"
                />
              </button>
            )}
          </For>
        </div>
        <Show when={list.loading}>
          <div class="flex justify-center py-4">
            <Spinner class="size-5 text-icon-base" />
          </div>
        </Show>
        <Show when={list.cursor && !list.loading}>
          <div class="flex justify-center">
            <Button variant="secondary" onClick={() => void load(list.cursor)}>
              {t("images.loadMore")}
            </Button>
          </div>
        </Show>
      </div>
      <Show when={open()}>
        {(asset) => (
          <Lightbox
            src={asset().url}
            downloadHref={`${asset().url}?download`}
            caption={asset().promptEnhanced ?? asset().prompt}
            onClose={() => setOpen(undefined)}
            onReuse={() => reuse(asset())}
          />
        )}
      </Show>
    </div>
  )
}
