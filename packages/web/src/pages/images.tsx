import { A, useSearchParams } from "@solidjs/router"
import { createEffect, createMemo, createResource, createSignal, For, on, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { Button } from "@kiwii/ui/button"
import { Spinner } from "@kiwii/ui/spinner"
import { showToast } from "@kiwii/ui/toast"
import { api, ApiError, apiStream } from "@/api"
import { GenerationCard } from "@/components/generation-card"
import { Lightbox } from "@/components/lightbox"
import { StudioPromptBar, type StudioSettings } from "@/components/studio-prompt-bar"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import type { Generation, ModelsResponse, Reference } from "@/images"

const SETTINGS_KEY = "kiwii-studio"

function loadSettings(): StudioSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<StudioSettings> | null
    if (stored && typeof stored.model === "string") {
      return {
        model: stored.model,
        option: stored.option ?? "",
        aspectRatio: stored.aspectRatio ?? "1:1",
        n: stored.n ?? 1,
        enhance: stored.enhance ?? true,
      }
    }
  } catch {}
  return { model: "gpt-image-2.5", option: "medium", aspectRatio: "1:1", n: 1, enhance: true }
}

export default function Images() {
  const { t } = useLanguage()
  const auth = useAuth()
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
  const [open, setOpen] = createSignal<{ generation: Generation; index: number }>()
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
      showToast({ title: error instanceof ApiError ? error.message : t("error.network"), variant: "error" })
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

  const generate = async () => {
    const cfg = config()
    if (!cfg) return
    const body = {
      model: settings.model,
      option: settings.option,
      aspectRatio: settings.aspectRatio,
      n: settings.n,
      prompt: prompt().trim(),
      enhance: settings.enhance,
      referenceFileIDs: references().map((r) => r.id),
    }
    setRunning(running() + 1)
    let id: string | undefined
    try {
      for await (const event of apiStream("/images/generations", body)) {
        if (event.event === "start") {
          const g = event.data as Generation
          id = g.id
          setList(produce((s) => s.items.unshift({ ...g, images: [], previews: {} })))
          setPrompt("")
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
        if (event.event === "done") {
          const data = event.data as { creditsFinal: number; refunded: number }
          update(id, (g) => {
            g.status = "done"
            g.creditsFinal = data.creditsFinal
            g.refunded = data.refunded
            g.previews = {}
          })
          void auth.refresh()
        }
        if (event.event === "error") {
          const data = event.data as { message: string; refunded: number }
          update(id, (g) => {
            g.status = "failed"
            g.errorMessage = data.message
            g.refunded = data.refunded
            g.previews = {}
          })
          showToast({ title: data.message, variant: "error" })
          void auth.refresh()
        }
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === "INSUFFICIENT_CREDITS") {
        showToast({ title: t("images.insufficient"), variant: "error" })
      } else {
        showToast({ title: error instanceof ApiError ? error.message : t("error.network"), variant: "error" })
      }
      if (id) update(id, (g) => (g.status = "failed"))
    } finally {
      setRunning(running() - 1)
    }
  }

  const reuse = (g: Generation) => {
    setPrompt(g.prompt)
    patch({ model: g.model, option: g.option, aspectRatio: g.aspectRatio, n: g.n })
    setOpen(undefined)
    window.scrollTo({ top: 0 })
  }

  const remove = async (g: Generation) => {
    if (!confirm(t("images.deleteConfirm"))) return
    try {
      await api(`/images/generations/${g.id}`, { method: "DELETE" })
      setList("items", (items) => items.filter((item) => item.id !== g.id))
    } catch (error) {
      showToast({ title: error instanceof ApiError ? error.message : t("error.generic"), variant: "error" })
    }
  }

  const locked = () => config()?.canGenerate === false
  const busy = () => running() >= (config()?.parallelLimit ?? 1)

  return (
    <div class="flex h-full min-h-0 flex-col">
      <div class="flex-1 overflow-y-auto">
        <div class="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6">
          <Show when={locked()}>
            <div class="flex flex-col items-start gap-2 rounded-2xl border border-border-weak-base bg-surface-raised-base p-5">
              <h2 class="text-16-medium text-text-strong">{t("images.locked.title")}</h2>
              <p class="text-14-regular text-text-weak">{t("images.locked.lead")}</p>
              <A href="/pricing">
                <Button variant="primary">{t("images.locked.cta")}</Button>
              </A>
            </div>
          </Show>
          <Show when={!list.loading && list.items.length === 0 && !locked()}>
            <div class="flex flex-col items-center justify-center gap-2 py-20 text-center">
              <h1 class="text-20-medium text-text-strong">{t("images.empty.title")}</h1>
              <p class="max-w-md text-14-regular text-text-weak">{t("images.empty.lead")}</p>
            </div>
          </Show>
          <For each={list.items}>
            {(g) => (
              <GenerationCard
                generation={g}
                model={config()?.models.find((m) => m.id === g.model)}
                onOpen={(index) => setOpen({ generation: g, index })}
                onReuse={() => reuse(g)}
                onDelete={() => void remove(g)}
              />
            )}
          </For>
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
      </div>
      <div class="px-4 pb-4 pt-2">
        <Show when={config()}>
          {(cfg) => (
            <StudioPromptBar
              config={cfg()}
              settings={settings}
              onSettings={patch}
              prompt={prompt()}
              onPrompt={setPrompt}
              references={references()}
              onReferences={setReferences}
              cost={cost()}
              busy={busy()}
              locked={locked()}
              onGenerate={() => void generate()}
            />
          )}
        </Show>
      </div>
      <Show when={open()}>
        {(state) => {
          const image = () => state().generation.images.find((img) => img.position === state().index)
          return (
            <Show when={image()}>
              {(img) => (
                <Lightbox
                  src={img().url}
                  downloadHref={`${img().url}?download`}
                  caption={state().generation.promptEnhanced ?? state().generation.prompt}
                  onClose={() => setOpen(undefined)}
                  onReuse={() => reuse(state().generation)}
                />
              )}
            </Show>
          )
        }}
      </Show>
    </div>
  )
}
