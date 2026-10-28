import { A, useNavigate } from "@solidjs/router"
import { createSignal, For, onMount, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { api } from "@/api"
import { Lightbox } from "@/components/lightbox"
import { Page } from "@/components/page"
import { useLanguage } from "@/context/language"
import { aspectStyle } from "@/images"
import { errorMessage } from "@/lib/errors"
import { Button, buttonClass } from "@/ui/button"
import { Skeleton } from "@/ui/skeleton"
import { toast } from "@/ui/toast"

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

const PLACEHOLDER_RATIOS = ["1:1", "3:4", "4:3", "9:16", "1:1", "16:9", "3:4", "1:1"]

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
    await api<{ assets: Asset[]; nextCursor: string | null }>(
      `/images/assets?limit=40${cursor ? `&cursor=${cursor}` : ""}`,
    )
      .then((page) =>
        setList(
          produce((s) => {
            s.items.push(...page.assets)
            s.cursor = page.nextCursor
          }),
        ),
      )
      .catch((error: unknown) => toast.error(errorMessage(error, t("error.network"))))
    setList("loading", false)
  }
  onMount(() => void load())

  const reuse = (asset: Asset) => {
    navigate(`/images?prompt=${encodeURIComponent(asset.prompt)}&model=${encodeURIComponent(asset.model)}`)
  }

  return (
    <Page title={t("assets.title")} width="wide">
      <Show when={!list.loading && list.items.length === 0}>
        <div class="flex flex-col items-center gap-4 py-16 text-center">
          <p class="max-w-sm text-callout text-label-2">{t("assets.empty")}</p>
          <A href="/images" class={buttonClass("primary")}>
            {t("images.generate")}
          </A>
        </div>
      </Show>
      <div class="columns-2 gap-2 md:columns-3 md:gap-3 lg:columns-4 xl:columns-5" aria-busy={list.loading}>
        <For each={list.items}>
          {(asset) => (
            <button
              type="button"
              class="group/asset mb-2 block w-full overflow-hidden rounded-[14px] bg-fill md:mb-3"
              style={aspectStyle(asset.aspectRatio)}
              aria-label={(asset.promptEnhanced ?? asset.prompt).slice(0, 120)}
              onClick={() => setOpen(asset)}
            >
              <img
                src={asset.url}
                alt=""
                loading="lazy"
                decoding="async"
                class="size-full object-cover transition-transform duration-(--motion-standard) ease-standard group-hover/asset:scale-[1.02]"
              />
            </button>
          )}
        </For>
        <Show when={list.loading}>
          <For each={PLACEHOLDER_RATIOS}>
            {(ratio) => (
              <div class="mb-2 md:mb-3" style={aspectStyle(ratio)}>
                <Skeleton class="size-full rounded-[14px]" />
              </div>
            )}
          </For>
        </Show>
      </div>
      <Show when={list.cursor && !list.loading}>
        <div class="flex justify-center pt-4">
          <Button variant="secondary" onClick={() => void load(list.cursor)}>
            {t("images.loadMore")}
          </Button>
        </div>
      </Show>
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
    </Page>
  )
}
