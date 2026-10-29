import { useNavigate } from "@solidjs/router"
import { createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "@kiwii/ui/context/helper"
import { api, ApiError, apiStream, type SSEEvent } from "@/api"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"
import { useProjects } from "@/context/projects"
import type { Generation, ModelsResponse, Reference, StudioSettings } from "@/images"
import { errorMessage } from "@/lib/errors"
import { askConfirm } from "@/ui/confirm"
import { toast } from "@/ui/toast"

const SETTINGS_KEY = "kiwii-studio"
const PAGE = 12

// The gallery of every run, wherever it was made; a project's own gallery is keyed by its id.
export const ALL = "all"

type Gallery = { ids: string[]; cursor: string | null; loading: boolean; loaded: boolean }

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

// The studio's state, above the screens so it outlives them: the options and the draft, and every
// run seen this session with the galleries that list them. A run keeps streaming into its tile
// while the person looks at another project, and is there, current, when they come back.
export const { use: useStudio, provider: StudioProvider } = createSimpleContext({
  name: "Studio",
  init: () => {
    const { t } = useLanguage()
    const auth = useAuth()
    const projects = useProjects()
    const navigate = useNavigate()
    const [config, { refetch: refreshConfig }] = createResource(() => api<ModelsResponse>("/images/models"))
    const [settings, setSettings] = createStore<StudioSettings>(loadSettings())
    const [prompt, setPrompt] = createSignal("")
    const [references, setReferences] = createSignal<Reference[]>([])
    const [state, setState] = createStore<{ runs: Record<string, Generation>; galleries: Record<string, Gallery> }>({
      runs: {},
      galleries: {},
    })
    const [running, setRunning] = createSignal(0)

    const patch = (next: Partial<StudioSettings>) => {
      setSettings(next)
      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...settings, ...next }))
      } catch {}
    }

    // Keeps the options valid for the live config: a model may be gone, or an option recalibrated away.
    createEffect(() => {
      const cfg = config()
      if (!cfg) return
      const model = cfg.models.find((m) => m.id === settings.model) ?? cfg.models[0]
      if (!model) return
      const next: Partial<StudioSettings> = {}
      if (model.id !== settings.model) next.model = model.id
      if (!model.options.some((o) => o.id === settings.option)) next.option = model.options[0]?.id ?? ""
      if (!model.aspectRatios.includes(settings.aspectRatio)) next.aspectRatio = "1:1"
      if (settings.n < 1 || settings.n > cfg.maxImages) next.n = 1
      if (Object.keys(next).length) patch(next)
    })

    const cost = createMemo(() => {
      const cfg = config()
      const model = cfg?.models.find((m) => m.id === settings.model)
      const option = model?.options.find((o) => o.id === settings.option)
      if (!model || !option) return undefined
      return option.credits * settings.n + (references().length > 0 ? model.referenceSurcharge : 0)
    })

    const gallery = (key: string) => state.galleries[key]
    const items = (key: string) =>
      (state.galleries[key]?.ids ?? []).map((id) => state.runs[id]).filter((g): g is Generation => !!g)
    const preparing = () => Object.keys(state.runs).some((id) => id.startsWith("pending-"))

    const load = async (key: string, more = false) => {
      if (gallery(key)?.loading) return
      const cursor = more ? gallery(key)?.cursor : null
      setState("galleries", key, (current) => ({
        ...(current ?? { ids: [], cursor: null, loaded: false }),
        loading: true,
      }))
      const query = new URLSearchParams({ limit: String(PAGE) })
      if (key !== ALL) query.set("project", key)
      if (cursor) query.set("cursor", cursor)
      await api<{ generations: Generation[]; nextCursor: string | null }>(`/images/generations?${query}`)
        .then((page) =>
          setState(
            produce((s) => {
              const target = s.galleries[key]
              for (const g of page.generations) {
                // A run this session is still following keeps its live state over the server's copy.
                if (!s.runs[g.id]) s.runs[g.id] = g
                if (!target.ids.includes(g.id)) target.ids.push(g.id)
              }
              target.cursor = page.nextCursor
              target.loaded = true
            }),
          ),
        )
        .catch((error: unknown) => toast.error(errorMessage(error, t("error.network"))))
      setState("galleries", key, "loading", false)
    }

    const update = (id: string, fn: (g: Generation) => void) =>
      setState(
        produce((s) => {
          const g = s.runs[id]
          if (g) fn(g)
        }),
      )

    // Puts `next` where `id` was in every gallery (a placeholder, or a failed run being retried, is
    // replaced by the run the server accepted, in the same spot) and adds it on top of the galleries
    // in `into` that do not list it yet.
    const place = (id: string, next: Generation, into: string[]) =>
      setState(
        produce((s) => {
          s.runs[next.id] = next
          if (id !== next.id) delete s.runs[id]
          for (const [key, target] of Object.entries(s.galleries)) {
            const at = target.ids.indexOf(id)
            if (at >= 0) target.ids[at] = next.id
            if (at < 0 && into.includes(key) && !target.ids.includes(next.id)) target.ids.unshift(next.id)
          }
        }),
      )

    // One event of a run's stream, from the composer or from the assistant. Previews stay until the
    // page is left: each frame keeps its blurred preview under the final picture until it has loaded.
    const follow = (id: string, event: SSEEvent) => {
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

    // A run's stream can end or stall before its last event: iOS suspends a page in the background,
    // and a phone network may drop a quiet connection while a picture renders. The tile would then
    // spin as if the run were starting over, though the server finished long ago. So while any run
    // here is running, the studio asks the server how the latest runs stand: every 10 seconds, when
    // the page comes back, and right after a stream ends early.
    const settle = async () => {
      const waiting = Object.values(state.runs).filter((g) => g.status === "running" && !g.id.startsWith("pending-"))
      if (waiting.length === 0) return
      const page = await api<{ generations: Generation[] }>("/images/generations?limit=24").catch(() => undefined)
      for (const run of waiting) {
        const known =
          page?.generations.find((g) => g.id === run.id) ??
          (await api<Generation>(`/images/generations/${run.id}`).catch(() => undefined))
        if (!known || known.status === "running") continue
        update(run.id, (g) => {
          g.status = known.status
          g.images = known.images
          g.creditsFinal = known.creditsFinal
          g.error = known.error
          g.finishedAt = known.finishedAt
        })
        void auth.refresh()
      }
    }
    const back = () => {
      if (document.visibilityState === "visible") void settle()
    }
    const timer = setInterval(() => void settle(), 10_000)
    document.addEventListener("visibilitychange", back)
    window.addEventListener("online", back)
    onCleanup(() => {
      clearInterval(timer)
      document.removeEventListener("visibilitychange", back)
      window.removeEventListener("online", back)
    })

    const drop = (id: string) =>
      setState(
        produce((s) => {
          delete s.runs[id]
          for (const target of Object.values(s.galleries)) target.ids = target.ids.filter((item) => item !== id)
        }),
      )

    // A new run from the composer into `projectID` (none: it shows only under "all"), or the same run
    // again when `from`, a failed one, is retried. The gallery shows the run at once; the server takes
    // a few seconds to prepare the prompt and the references before it answers, and that wait must
    // look like work, not like nothing.
    const generate = async (projectID: string | undefined, from?: Generation) => {
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
            projectID: from.projectID ?? undefined,
          }
        : {
            model: settings.model,
            option: settings.option,
            aspectRatio: settings.aspectRatio,
            n: settings.n,
            prompt: prompt().trim(),
            referenceFileIDs: references().map((r) => r.id),
            projectID,
          }
      const into = body.projectID ? [ALL, body.projectID] : [ALL]
      const pending = from?.id ?? `pending-${Date.now()}`
      if (from) update(from.id, (g) => (g.preparing = true))
      if (!from) {
        place(
          pending,
          {
            ...body,
            id: pending,
            status: "running",
            projectID: body.projectID ?? null,
            creditsReserved: cost() ?? 0,
            creditsFinal: null,
            error: null,
            createdAt: Date.now(),
            finishedAt: null,
            images: [],
            previews: {},
            preparing: true,
          },
          into,
        )
        setPrompt("")
      }
      setRunning(running() + 1)
      let id: string | undefined
      try {
        for await (const event of apiStream("/images/generations", body)) {
          if (event.event === "start") {
            const g = event.data as Generation
            id = g.id
            place(pending, { ...g, images: [], previews: {} }, into)
            if (g.projectID) projects.touched()
            continue
          }
          if (id) follow(id, event)
        }
        // The stream ended before the run's last event; the server knows how it went.
        if (id && state.runs[id]?.status === "running") void settle()
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
          drop(pending)
          setPrompt(body.prompt)
        }
      } finally {
        if (!id && from) update(from.id, (g) => (g.preparing = false))
        setRunning(running() - 1)
      }
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
        .then(() => drop(g.id))
        .catch((error: unknown) => toast.error(errorMessage(error, t("error.generic"))))
    }

    return {
      config,
      refreshConfig,
      settings,
      patch,
      prompt,
      setPrompt,
      references,
      setReferences,
      cost,
      gallery,
      items,
      run: (id: string) => state.runs[id],
      load,
      generate,
      remove,
      // For runs the assistant starts: shown on top of `into`, then kept current by their events.
      adopt: (g: Generation, into: string[]) => place(g.id, g, into),
      follow,
      // A run the server described (in a conversation) but no gallery has listed yet.
      know: (g: Generation) => setState("runs", g.id, (current) => current ?? g),
      locked: () => config()?.canGenerate === false,
      busy: () => running() >= (config()?.parallelLimit ?? 1) || preparing(),
    }
  },
})
