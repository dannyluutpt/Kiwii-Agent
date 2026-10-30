import { useNavigate } from "@solidjs/router"
import { createEffect, createMemo, createResource, createSignal, onCleanup } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "@kiwii/ui/context/helper"
import { api, ApiError, apiStream, apiUpload, type SSEEvent } from "@/api"
import { BRAND_SLUG } from "@/brand"
import { useAuth } from "@/context/auth"
import { useCharacters } from "@/context/characters"
import { useLanguage } from "@/context/language"
import { useLocations } from "@/context/locations"
import { useProjects } from "@/context/projects"
import type {
  Generation,
  ModelsResponse,
  Reference,
  StudioMode,
  StudioSettings,
  VideoModelsResponse,
  VideoSettings,
} from "@/images"
import { errorMessage } from "@/lib/errors"
import { grabStill } from "@/lib/frame"
import { shrinkImage } from "@/lib/image"
import { askConfirm } from "@/ui/confirm"
import { toast } from "@/ui/toast"

const SETTINGS_KEY = "kiwii-studio"
const VIDEO_KEY = "kiwii-studio-video"
const MODE_KEY = "kiwii-studio-mode"
const PAGE = 12

// The gallery of every run, wherever it was made; a project's own gallery is keyed by its id. Either
// narrowed to pictures or to clips is keyed with ":image" or ":video" after that.
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

function loadVideoSettings(): VideoSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(VIDEO_KEY) ?? "null") as Partial<VideoSettings> | null
    if (stored && typeof stored.model === "string") {
      return {
        model: stored.model,
        option: stored.option ?? "",
        aspectRatio: stored.aspectRatio ?? "16:9",
        duration: stored.duration ?? 5,
      }
    }
  } catch {}
  return { model: "wan-3.0", option: "720p", aspectRatio: "16:9", duration: 5 }
}

function loadMode(): StudioMode {
  try {
    return localStorage.getItem(MODE_KEY) === "video" ? "video" : "image"
  } catch {
    return "image"
  }
}

const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {}
}

// The studio's state, above the screens so it outlives them: the options and the draft, and every
// run seen this session with the galleries that list them. A run keeps streaming into its tile
// while the person looks at another project, and is there, current, when they come back.
export const { use: useStudio, provider: StudioProvider } = createSimpleContext({
  name: "Studio",
  init: () => {
    const { t } = useLanguage()
    const auth = useAuth()
    const characters = useCharacters()
    const locations = useLocations()
    const projects = useProjects()
    const navigate = useNavigate()
    const [config, { refetch: refreshConfig }] = createResource(() => api<ModelsResponse>("/images/models"))
    const [videoConfig, { refetch: refreshVideoConfig }] = createResource(() =>
      api<VideoModelsResponse>("/videos/models"),
    )
    const [settings, setSettings] = createStore<StudioSettings>(loadSettings())
    const [video, setVideo] = createStore<VideoSettings>(loadVideoSettings())
    const [mode, setModeSignal] = createSignal<StudioMode>(loadMode())
    const [prompt, setPrompt] = createSignal("")
    const [references, setReferences] = createSignal<Reference[]>([])
    // The picture a clip ends on, next to its first frame (the first reference).
    const [lastFrame, setLastFrame] = createSignal<Reference>()
    // While a clip's last frame is grabbed and uploaded to start the next clip from.
    const [framing, setFraming] = createSignal(false)
    // How many clips in a row were made each from the one before, by run, this session: characters
    // drift after a few, and the studio says so.
    const chains: Record<string, number> = {}
    let continued: { fileID: string; length: number } | undefined
    const [state, setState] = createStore<{ runs: Record<string, Generation>; galleries: Record<string, Gallery> }>({
      runs: {},
      galleries: {},
    })
    const [running, setRunning] = createSignal(0)

    const patch = (next: Partial<StudioSettings>) => {
      setSettings(next)
      store(SETTINGS_KEY, JSON.stringify({ ...settings, ...next }))
    }
    const patchVideo = (next: Partial<VideoSettings>) => {
      setVideo(next)
      store(VIDEO_KEY, JSON.stringify({ ...video, ...next }))
    }
    // A clip starts from one picture at most.
    const setMode = (next: StudioMode) => {
      setModeSignal(next)
      store(MODE_KEY, next)
      if (next === "video" && references().length > 1) setReferences(references().slice(0, 1))
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

    // The same for the clip's options, which the video models set for themselves.
    createEffect(() => {
      const cfg = videoConfig()
      if (!cfg) return
      const model = cfg.models.find((m) => m.id === video.model) ?? cfg.models[0]
      if (!model) return
      const next: Partial<VideoSettings> = {}
      if (model.id !== video.model) next.model = model.id
      if (!model.options.some((o) => o.id === video.option)) next.option = model.options[0]?.id ?? ""
      if (!model.aspectRatios.includes(video.aspectRatio)) next.aspectRatio = model.aspectRatios[0] ?? "16:9"
      if (!model.durations.includes(video.duration)) next.duration = model.durations[0] ?? 5
      if (Object.keys(next).length) patchVideo(next)
    })

    const imageCost = createMemo(() => {
      const cfg = config()
      const model = cfg?.models.find((m) => m.id === settings.model)
      const option = model?.options.find((o) => o.id === settings.option)
      if (!model || !option) return undefined
      // The characters' and the location's photos are read as reference pictures too.
      const read = references().length + characters.picked().length + locations.picked().length
      return option.credits * settings.n + (read > 0 ? model.referenceSurcharge : 0)
    })
    const clipModel = () => videoConfig()?.models.find((m) => m.id === video.model)
    const videoCost = createMemo(() => {
      const model = clipModel()
      const credits = model?.options.find((o) => o.id === video.option)?.credits[String(video.duration)]
      if (!model || credits === undefined) return undefined
      return credits + (references().length > 0 ? model.firstFrameCredits : 0)
    })
    // What the composer's run costs, in the mode it is in.
    const cost = () => (mode() === "video" ? videoCost() : imageCost())

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
      const [base = ALL, kind] = key.split(":")
      const query = new URLSearchParams({ limit: String(PAGE) })
      if (base !== ALL) query.set("project", base)
      if (kind) query.set("kind", kind)
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
    // in `into`, and of their pictures-only or clips-only views, that do not list it yet.
    const place = (id: string, next: Generation, into: string[]) => {
      const targets = into.flatMap((key) => [key, `${key}:${next.kind}`])
      setState(
        produce((s) => {
          s.runs[next.id] = next
          if (id !== next.id) delete s.runs[id]
          for (const [key, target] of Object.entries(s.galleries)) {
            const at = target.ids.indexOf(id)
            if (at >= 0) target.ids[at] = next.id
            if (at < 0 && targets.includes(key) && !target.ids.includes(next.id)) target.ids.unshift(next.id)
          }
        }),
      )
    }

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
          // A clip that failed gave back all it held.
          if (known.kind === "video" && known.status === "failed") g.refunded = known.creditsReserved
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
    const generateImage = async (projectID: string | undefined, from?: Generation) => {
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
            characterIDs: from.characterIDs,
            locationID: from.locationID ?? undefined,
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
            characterIDs: characters.picked(),
            locationID: locations.picked()[0],
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
            kind: "image",
            duration: null,
            lastFrameFileID: null,
            locationID: body.locationID ?? null,
            status: "running",
            projectID: body.projectID ?? null,
            creditsReserved: imageCost() ?? 0,
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

    // A clip from the composer, or the same clip again for a failed one. The server answers once the
    // job is submitted; the clip takes minutes, and `settle` sees it finish.
    const generateVideo = async (projectID: string | undefined, from?: Generation) => {
      if (!videoConfig() || (from ? from.preparing : preparing())) return
      const body = from
        ? {
            model: from.model,
            option: from.option,
            aspectRatio: from.aspectRatio,
            duration: from.duration ?? 5,
            prompt: from.prompt,
            referenceFileIDs: from.referenceFileIDs,
            lastFrameFileID: from.lastFrameFileID ?? undefined,
            projectID: from.projectID ?? undefined,
          }
        : {
            model: video.model,
            option: video.option,
            aspectRatio: video.aspectRatio,
            duration: video.duration,
            prompt: prompt().trim(),
            referenceFileIDs: references()
              .slice(0, 1)
              .map((r) => r.id),
            // Only with a first frame, and for a model that ends on a picture.
            lastFrameFileID: references().length > 0 && clipModel()?.lastFrame ? lastFrame()?.id : undefined,
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
            kind: "video",
            lastFrameFileID: body.lastFrameFileID ?? null,
            status: "running",
            n: 1,
            characterIDs: [],
            locationID: null,
            projectID: body.projectID ?? null,
            creditsReserved: videoCost() ?? 0,
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
      await api<Generation>("/videos/generations", { body })
        .then((g) => {
          if (!from && continued && body.referenceFileIDs[0] === continued.fileID) chains[g.id] = continued.length
          place(pending, { ...g, images: [], previews: {} }, into)
          if (g.projectID) projects.touched()
          void auth.refresh()
        })
        .catch((error: unknown) => {
          const insufficient = error instanceof ApiError && error.code === "INSUFFICIENT_CREDITS"
          if (insufficient) {
            toast.error(t("images.insufficient"), {
              action: { label: t("images.topup"), onClick: () => navigate("/pricing") },
            })
          }
          if (!insufficient) toast.error(errorMessage(error, t("error.network")))
          if (from) update(from.id, (g) => (g.preparing = false))
          // The server kept nothing it could show: hand the prompt back rather than leave a tile.
          if (!from) {
            drop(pending)
            setPrompt(body.prompt)
          }
        })
      setRunning(running() - 1)
    }

    // The next clip starts where `g` ends, or at the frame `at` seconds in: that frame becomes its
    // first frame, with the same model, resolution, length and shape. Nothing is charged until the
    // person writes what happens next and makes the clip.
    const continueFrom = async (g: Generation, at?: number) => {
      const clip = g.images[0]
      if (g.kind !== "video" || !clip) return
      setMode("video")
      patchVideo({
        model: g.model,
        option: g.option,
        aspectRatio: g.aspectRatio,
        duration: g.duration ?? video.duration,
      })
      setReferences([])
      setLastFrame(undefined)
      const length = (chains[g.id] ?? 1) + 1
      if (length > 3) toast.show(t("video.nextScene.drift", { n: length - 1 }))
      setFraming(true)
      const edge = clipModel()?.maxReferenceEdge ?? 1920
      const stored = await grabStill(clip.url, at)
        .then((still) =>
          shrinkImage(new File([still.blob], `${BRAND_SLUG}-${g.id}-frame.jpg`, { type: "image/jpeg" }), edge),
        )
        .then(async (fitted) => {
          const form = new FormData()
          form.append("file", fitted.file)
          const saved = await apiUpload<{ id: string; url: string; name: string }>("/images/references", form)
          return { ...saved, edge: Math.max(fitted.width, fitted.height) }
        })
        .catch(() => undefined)
      setFraming(false)
      if (!stored) {
        toast.error(t("video.nextScene.failed"))
        return
      }
      setReferences([stored])
      continued = { fileID: stored.id, length }
    }

    const generate = (projectID: string | undefined, from?: Generation) =>
      (from ? from.kind === "video" : mode() === "video")
        ? generateVideo(projectID, from)
        : generateImage(projectID, from)

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
      videoConfig,
      refreshVideoConfig,
      settings,
      patch,
      video,
      patchVideo,
      mode,
      setMode,
      prompt,
      setPrompt,
      references,
      setReferences,
      lastFrame,
      setLastFrame,
      framing,
      continueFrom,
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
      // Clips are for paid plans only, the trial included.
      videoLocked: () => videoConfig()?.canGenerate === false,
      busy: () => running() >= (config()?.parallelLimit ?? 1) || preparing(),
    }
  },
})
