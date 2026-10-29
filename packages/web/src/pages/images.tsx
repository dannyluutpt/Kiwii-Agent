import { A, useNavigate, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, createSignal, For, on, Show, type JSX } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { api, ApiError, apiStream } from "@/api"
import { BRAND_SLUG } from "@/brand"
import { GenerationTile } from "@/components/generation-tile"
import { IconGlobe, IconImage, IconPencil, IconSparkles } from "@/components/icons"
import { Lightbox, type LightboxItem } from "@/components/lightbox"
import { LoadMore } from "@/components/load-more"
import { StudioPanel } from "@/components/studio-panel"
import { StudioPromptBar } from "@/components/studio-prompt-bar"
import { TopBar } from "@/components/top-bar"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import type { I18nKey } from "@/i18n/vi"
import {
  altFor,
  aspectStyle,
  type Generation,
  type ModelsResponse,
  type Reference,
  type StudioSettings,
} from "@/images"
import { errorMessage } from "@/lib/errors"
import { buttonClass } from "@/ui/button"
import { askConfirm } from "@/ui/confirm"
import { Skeleton } from "@/ui/skeleton"
import { toast } from "@/ui/toast"

const SETTINGS_KEY = "kiwii-studio"
const PLACEHOLDER_RATIOS = ["1:1", "3:4", "16:9", "1:1", "9:16", "4:3"]

const SUGGESTIONS: Array<{ icon: () => JSX.Element; title: I18nKey; prompt: I18nKey }> = [
  {
    icon: () => <IconImage class="size-5" />,
    title: "images.suggest.photo.title",
    prompt: "images.suggest.photo.prompt",
  },
  {
    icon: () => <IconSparkles class="size-5" />,
    title: "images.suggest.product.title",
    prompt: "images.suggest.product.prompt",
  },
  {
    icon: () => <IconPencil class="size-5" />,
    title: "images.suggest.illustration.title",
    prompt: "images.suggest.illustration.prompt",
  },
  {
    icon: () => <IconGlobe class="size-5" />,
    title: "images.suggest.poster.title",
    prompt: "images.suggest.poster.prompt",
  },
]

function loadSettings(): StudioSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<StudioSettings> | null
    if (stored && typeof stored.model === "string") {
      return {
        model: stored.model,
        option: stored.option ?? "",
        aspectRatio: stored.aspectRatio ?? "1:1",
        n: stored.n ?? 1,
      }
    }
  } catch {}
  return { model: "gpt-image-2.5", option: "medium", aspectRatio: "1:1", n: 1 }
}

// The studio: a control panel beside a gallery of runs on wide screens, the gallery over a docked
// composer on phones. A run shows up in the gallery the moment it is asked for, shimmering while
// the server prepares and renders it.
export default function Images() {
  const { t } = useLanguage()
  const auth = useAuth()
  const layout = useLayout()
  const navigate = useNavigate()
  let feed: HTMLDivElement | undefined
  const [search, setSearch] = useSearchParams<{ prompt?: string; model?: string }>()
  const [config] = createResource(() => api<ModelsResponse>("/images/models"))
  const [settings, setSettings] = createStore<StudioSettings>(loadSettings())
  const [prompt, setPrompt] = createSignal(search.prompt ?? "")
  const [references, setReferences] = createSignal<Reference[]>([])
  const [list, setList] = createStore<{ items: Generation[]; cursor: string | null; loading: boolean }>({
    items: [],
    cursor: null,
    loading: true,
  })
  const [viewer, setViewer] = createSignal<{ id: string; index: number }>()
  const [running, setRunning] = createSignal(0)

  const patch = (next: Partial<StudioSettings>) => {
    setSettings(next)
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, ...next }))
    } catch {}
  }

  // Reconcile stored settings with the live config (an option may have been recalibrated away).
  createEffect(
    on(config, (cfg) => {
      if (!cfg) return
      if (search.model) {
        patch({ model: search.model })
        setSearch({ model: undefined, prompt: undefined }, { replace: true })
      }
      const model = cfg.models.find((m) => m.id === settings.model) ?? cfg.models[0]
      if (!model) return
      const next: Partial<StudioSettings> = {}
      if (model.id !== settings.model) next.model = model.id
      if (!model.options.some((o) => o.id === settings.option)) next.option = model.options[0]?.id ?? ""
      if (!model.aspectRatios.includes(settings.aspectRatio)) next.aspectRatio = "1:1"
      if (settings.n < 1 || settings.n > cfg.maxImages) next.n = 1
      if (Object.keys(next).length) patch(next)
    }),
  )

  const cost = createMemo(() => {
    const cfg = config()
    const option = cfg?.models.find((m) => m.id === settings.model)?.options.find((o) => o.id === settings.option)
    if (!cfg || !option) return undefined
    return option.credits * settings.n + (references().length > 0 ? cfg.referenceSurcharge : 0)
  })

  const load = async (cursor?: string | null) => {
    setList("loading", true)
    try {
      const page = await api<{ generations: Generation[]; nextCursor: string | null }>(
        `/images/generations?limit=12${cursor ? `&cursor=${cursor}` : ""}`,
      )
      setList(
        produce((s) => {
          const known = new Set(s.items.map((g) => g.id))
          s.items.push(...page.generations.filter((g) => !known.has(g.id)))
          s.cursor = page.nextCursor
        }),
      )
    } catch (error) {
      toast.error(errorMessage(error, t("error.network")))
    } finally {
      setList("loading", false)
    }
  }
  void load()

  const update = (id: string, fn: (g: Generation) => void) =>
    setList(
      produce((s) => {
        const g = s.items.find((item) => item.id === id)
        if (g) fn(g)
      }),
    )
  // Swaps the run the person is looking at (a placeholder, or a failed run being retried) for the
  // one the server just accepted, in the same spot.
  const replace = (id: string, next: Generation) =>
    setList(
      produce((s) => {
        const at = s.items.findIndex((item) => item.id === id)
        if (at >= 0) s.items[at] = next
        if (at < 0) s.items.unshift(next)
      }),
    )
  const preparing = () => list.items.some((g) => g.id.startsWith("pending-"))

  // A new run from the composer, or the same run again when `from` (a failed one) is retried. The
  // gallery shows the run at once; the server takes a few seconds to prepare the prompt and the
  // references before it answers, and that wait must look like work, not like nothing.
  const generate = async (from?: Generation) => {
    const cfg = config()
    if (!cfg || (from ? from.preparing : preparing())) return
    const body = from
      ? {
          model: from.model,
          option: from.option,
          aspectRatio: from.aspectRatio,
          n: from.n,
          prompt: from.prompt,
          referenceFileIDs: from.referenceFileIDs,
          // The server reuses the prompt it already screened and rewrote for this run.
          retryOf: from.id,
        }
      : {
          model: settings.model,
          option: settings.option,
          aspectRatio: settings.aspectRatio,
          n: settings.n,
          prompt: prompt().trim(),
          referenceFileIDs: references().map((r) => r.id),
        }
    const pending = from?.id ?? `pending-${Date.now()}`
    if (from) update(from.id, (g) => (g.preparing = true))
    if (!from) {
      setList(
        produce((s) =>
          s.items.unshift({
            ...body,
            id: pending,
            status: "running",
            creditsReserved: cost() ?? 0,
            creditsFinal: null,
            error: null,
            createdAt: Date.now(),
            finishedAt: null,
            images: [],
            previews: {},
            preparing: true,
          }),
        ),
      )
      setPrompt("")
      feed?.scrollTo({ top: 0, behavior: "smooth" })
    }
    setRunning(running() + 1)
    let id: string | undefined
    try {
      for await (const event of apiStream("/images/generations", body)) {
        if (event.event === "start") {
          const g = event.data as Generation
          id = g.id
          replace(pending, { ...g, images: [], previews: {} })
          continue
        }
        if (!id) continue
        if (event.event === "partial") {
          const data = event.data as { index: number; b64: string }
          update(id, (g) => {
            g.previews = { ...g.previews, [data.index]: `data:image/jpeg;base64,${data.b64}` }
          })
        }
        if (event.event === "image") {
          const data = event.data as { index: number; id: string; fileID: string }
          update(id, (g) => {
            g.images.push({
              id: data.id,
              fileID: data.fileID,
              position: data.index,
              url: `/api/images/files/${data.fileID}`,
            })
          })
        }
        // Previews stay until the page is left: each frame keeps its blurred preview under the final
        // picture until that picture has loaded.
        if (event.event === "done") {
          const data = event.data as { creditsFinal: number; refunded: number }
          update(id, (g) => {
            g.status = "done"
            g.creditsFinal = data.creditsFinal
            g.refunded = data.refunded
          })
          void auth.refresh()
        }
        if (event.event === "error") {
          const data = event.data as { message: string; refunded: number }
          update(id, (g) => {
            g.status = "failed"
            g.errorMessage = data.message
            g.refunded = data.refunded
          })
          void auth.refresh()
        }
      }
    } catch (error) {
      const insufficient = error instanceof ApiError && error.code === "INSUFFICIENT_CREDITS"
      if (insufficient) {
        toast.error(t("images.insufficient"), {
          action: { label: t("images.topup"), onClick: () => navigate("/pricing") },
        })
      }
      if (!insufficient) toast.error(errorMessage(error, t("error.network")))
      if (id) update(id, (g) => (g.status = "failed"))
      // The server never took the run: hand the prompt back rather than leave a failed tile.
      if (!id && !from) {
        setList("items", (items) => items.filter((g) => g.id !== pending))
        setPrompt(body.prompt)
      }
    } finally {
      if (!id && from) update(from.id, (g) => (g.preparing = false))
      setRunning(running() - 1)
    }
  }

  const reuse = (g: Generation) => {
    setPrompt(g.prompt)
    patch({ model: g.model, option: g.option, aspectRatio: g.aspectRatio, n: g.n })
    setViewer(undefined)
    // The gallery is the scroller here, not the window; bring the prompt into view and focus it.
    if (layout.phone()) feed?.scrollTo({ top: 0, behavior: "smooth" })
    requestAnimationFrame(() => document.querySelector<HTMLTextAreaElement>("[data-studio-prompt]")?.focus())
  }

  const remove = async (g: Generation) => {
    const ok = await askConfirm({
      title: t("images.deleteTitle"),
      description: t("images.deleteDescription"),
      confirmLabel: t("common.delete"),
      destructive: true,
    })
    if (!ok) return
    await api(`/images/generations/${g.id}`, { method: "DELETE" })
      .then(() => setList("items", (items) => items.filter((item) => item.id !== g.id)))
      .catch((error: unknown) => toast.error(errorMessage(error, t("error.generic"))))
  }

  const opened = () => list.items.find((g) => g.id === viewer()?.id)
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

  const locked = () => config()?.canGenerate === false
  const busy = () => running() >= (config()?.parallelLimit ?? 1) || preparing()
  const empty = () => !list.loading && list.items.length === 0

  const controls = (cfg: ModelsResponse) => ({
    config: cfg,
    settings,
    onSettings: patch,
    prompt: prompt(),
    onPrompt: setPrompt,
    references: references(),
    onReferences: setReferences,
    cost: cost(),
    busy: busy(),
    locked: locked(),
    onGenerate: () => void generate(),
  })

  const gallery = (
    <div ref={feed} data-scroller class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      <div class="flex min-h-full w-full flex-col gap-4 px-3 py-3 md:px-5 md:py-5">
        <Show when={config()?.trial}>
          <div class="flex flex-wrap items-center gap-3 rounded-card bg-accent-soft px-4 py-3">
            <p class="min-w-0 flex-1 text-subhead text-label">{t("images.trial", { n: config()?.credits ?? 0 })}</p>
            <A href="/pricing" class={buttonClass("primary", "sm")}>
              {t("images.locked.cta")}
            </A>
          </div>
        </Show>
        <Show when={locked()}>
          <div class="flex flex-col items-start gap-2 rounded-card bg-surface p-5 shadow-raised">
            <span class="flex size-10 items-center justify-center rounded-[12px] bg-accent-soft text-accent">
              <IconSparkles class="size-5" />
            </span>
            <h2 class="text-title-3 text-label">{t("images.locked.title")}</h2>
            <p class="text-callout text-label-2">{t("images.locked.lead")}</p>
            <A href="/pricing" class={buttonClass("primary", "md", "mt-2")}>
              {t("images.locked.cta")}
            </A>
          </div>
        </Show>
        <Show when={empty() && !locked()}>
          <div class="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 py-6">
            <div class="flex flex-col items-center gap-2 text-center">
              <span class="mb-1 flex size-14 items-center justify-center rounded-[16px] bg-accent-soft text-accent shadow-raised">
                <IconImage class="size-7" />
              </span>
              <h2 class="text-title-1 text-label">{t("images.empty.title")}</h2>
              <p class="max-w-md text-callout text-label-2">{t("images.empty.lead")}</p>
            </div>
            <ul class="grid gap-2.5 sm:grid-cols-2" aria-label={t("images.suggest.label")}>
              <For each={SUGGESTIONS}>
                {(item) => (
                  <li>
                    <button
                      type="button"
                      class="flex h-full w-full items-start gap-3 rounded-card bg-surface p-3.5 text-left shadow-raised transition-[background-color,transform] duration-(--motion-micro) ease-standard hover:bg-surface-2 active:scale-[0.99]"
                      onClick={() => {
                        setPrompt(t(item.prompt))
                        document.querySelector<HTMLTextAreaElement>("[data-studio-prompt]")?.focus()
                      }}
                    >
                      <span class="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
                        {item.icon()}
                      </span>
                      <span class="flex min-w-0 flex-col gap-0.5">
                        <span class="text-subhead font-semibold text-label">{t(item.title)}</span>
                        <span class="line-clamp-2 text-footnote text-label-2">{t(item.prompt)}</span>
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
        <Show when={list.items.length > 0 || list.loading}>
          <div class="columns-2 gap-2 md:gap-3 lg:columns-3 2xl:columns-4" aria-label={t("images.gallery")}>
            <For each={list.items}>
              {(g) => (
                <GenerationTile
                  generation={g}
                  model={config()?.models.find((m) => m.id === g.model)}
                  onOpen={(index) => setViewer({ id: g.id, index })}
                  onReuse={() => reuse(g)}
                  onRetry={() => void generate(g)}
                  onDelete={() => void remove(g)}
                />
              )}
            </For>
            <Show when={list.loading && list.items.length === 0}>
              <For each={PLACEHOLDER_RATIOS}>
                {(ratio) => (
                  <div class="mb-2 break-inside-avoid md:mb-3" style={aspectStyle(ratio)} aria-hidden="true">
                    <Skeleton class="size-full rounded-[14px]" />
                  </div>
                )}
              </For>
            </Show>
          </div>
        </Show>
        <Show when={list.items.length > 0}>
          <LoadMore more={!!list.cursor} loading={list.loading} onLoad={() => void load(list.cursor)} />
        </Show>
      </div>
    </div>
  )

  return (
    <div class="flex h-full min-h-0 flex-col pb-tabbar">
      <TopBar heading title={t("nav.images")} />
      <Show
        when={!layout.phone()}
        fallback={
          <>
            {gallery}
            <div class="px-3 pt-1 pb-3">
              <Show
                when={config()}
                fallback={<Skeleton class="mx-auto h-[104px] w-full max-w-3xl rounded-panel" aria-hidden="true" />}
              >
                {(cfg) => <StudioPromptBar {...controls(cfg())} />}
              </Show>
            </div>
          </>
        }
      >
        <div class="flex min-h-0 flex-1">
          <Show
            when={config()}
            fallback={
              <div class="flex w-[340px] shrink-0 flex-col gap-4 border-r border-separator bg-surface p-4 lg:w-[380px]">
                <Skeleton class="h-28 w-full rounded-[14px]" />
                <Skeleton class="h-40 w-full rounded-[14px]" />
                <Skeleton class="h-14 w-full rounded-[12px]" />
              </div>
            }
          >
            {(cfg) => <StudioPanel {...controls(cfg())} />}
          </Show>
          {gallery}
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
