import { useNavigate } from "@solidjs/router"
import { createStore, produce } from "solid-js/store"
import { createSimpleContext } from "@kiwii/ui/context/helper"
import { api, ApiError, apiStream } from "@/api"
import { useCharacters } from "@/context/characters"
import { useLanguage } from "@/context/language"
import { useLocations } from "@/context/locations"
import { useProjects } from "@/context/projects"
import { ALL, useStudio } from "@/context/studio"
import type { Generation, Message, MessagePart } from "@/images"
import { errorMessage } from "@/lib/errors"
import { toast } from "@/ui/toast"

type Thread = { messages: Message[]; loading: boolean; loaded: boolean; sending: boolean }

// Each project's conversation with the image assistant. The runs it starts go into the studio's
// galleries like any other and stream there; the conversation only names them.
export const { use: useAssistant, provider: AssistantProvider } = createSimpleContext({
  name: "Assistant",
  init: () => {
    const { t } = useLanguage()
    const navigate = useNavigate()
    const projects = useProjects()
    const studio = useStudio()
    const characters = useCharacters()
    const locations = useLocations()
    const [state, setState] = createStore<{ threads: Record<string, Thread> }>({ threads: {} })

    const thread = (projectID: string | undefined) => (projectID ? state.threads[projectID] : undefined)
    const edit = (projectID: string, fn: (thread: Thread) => void) =>
      setState(
        produce((s) => {
          s.threads[projectID] ??= { messages: [], loading: false, loaded: false, sending: false }
          fn(s.threads[projectID])
        }),
      )

    const load = async (projectID: string) => {
      if (thread(projectID)?.loaded || thread(projectID)?.loading) return
      edit(projectID, (current) => (current.loading = true))
      await api<{ messages: Message[]; generations: Generation[] }>(`/projects/${projectID}/messages`)
        .then((page) => {
          for (const g of page.generations) studio.know(g)
          edit(projectID, (current) => {
            // A message sent while the history was loading stays after it.
            const known = new Set(page.messages.map((m) => m.id))
            current.messages = [...page.messages, ...current.messages.filter((m) => !known.has(m.id))]
            current.loaded = true
          })
        })
        .catch((error: unknown) => toast.error(errorMessage(error, t("error.network"))))
      edit(projectID, (current) => (current.loading = false))
    }

    // Sends the composer's words and pictures with the current settings. From "all", the first
    // message opens a project, which takes its name from the message.
    const send = async (projectID: string | undefined) => {
      const text = studio.prompt().trim()
      if (!text || thread(projectID)?.sending) return
      const target = projectID ?? (await projects.create())?.id
      if (!target) return
      const references = studio.references()
      // Picked characters and the picked location stay picked for the next message.
      const cast = characters.picked().flatMap((id) => {
        const character = characters.find(id)
        return character ? [{ id, name: character.name }] : []
      })
      const place = locations.picked().flatMap((id) => {
        const saved = locations.find(id)
        return saved ? [{ id, name: saved.name }] : []
      })[0]
      const asked = `pending-${Date.now()}`
      let reply = `${asked}-reply`
      let started = false
      edit(target, (current) => {
        current.sending = true
        current.messages.push(
          {
            id: asked,
            role: "user",
            parts: [
              { type: "text", text },
              ...references.map((ref): MessagePart => ({ type: "image", fileID: ref.id })),
              ...cast.map((character): MessagePart => ({ type: "character", ...character })),
              ...(place ? [{ type: "location" as const, ...place }] : []),
            ],
            createdAt: Date.now(),
          },
          { id: reply, role: "assistant", parts: [], createdAt: Date.now(), pending: true },
        )
      })
      studio.setPrompt("")
      studio.setReferences([])
      const answer = (fn: (message: Message) => void) =>
        edit(target, (current) => {
          const message = current.messages.find((m) => m.id === reply)
          if (message) fn(message)
        })
      try {
        for await (const event of apiStream(`/projects/${target}/messages`, {
          text,
          settings: { ...studio.settings },
          referenceFileIDs: references.map((ref) => ref.id),
          characterIDs: cast.map((character) => character.id),
          locationID: place?.id,
        })) {
          if (event.event === "start") {
            const ids = event.data as { messageID: string; userMessageID: string }
            started = true
            edit(target, (current) => {
              // The history may have loaded the stored copy of this very message already.
              current.messages = current.messages.filter((m) => m.id !== ids.userMessageID)
              for (const m of current.messages) {
                if (m.id === asked) m.id = ids.userMessageID
                if (m.id === reply) m.id = ids.messageID
              }
            })
            reply = ids.messageID
          }
          if (event.event === "text-delta") {
            const delta = (event.data as { text: string }).text
            answer((message) => {
              const part = message.parts.find((p) => p.type === "text")
              if (part?.type === "text") part.text += delta
              if (!part) message.parts.unshift({ type: "text", text: delta })
            })
          }
          if (event.event === "generation-start") {
            const g = (event.data as { generation: Generation }).generation
            studio.adopt({ ...g, images: [], previews: {} }, [ALL, target])
            answer((message) => message.parts.push({ type: "generation", id: g.id }))
            projects.touched()
          }
          if (event.event.startsWith("generation-") && event.event !== "generation-start") {
            const data = event.data as { id: string; index?: number; imageID?: string; fileID?: string }
            studio.follow(data.id, {
              event: event.event.slice("generation-".length),
              data:
                event.event === "generation-image"
                  ? { index: data.index, id: data.imageID, fileID: data.fileID }
                  : data,
            })
          }
          if (event.event === "notice") {
            const notice = event.data as { code: string; message: string }
            answer((message) => message.parts.push({ type: "notice", code: notice.code, message: notice.message }))
          }
          if (event.event === "error") {
            const message = (event.data as { message: string }).message
            answer((m) => (m.failed = message))
          }
          if (event.event === "finish") {
            const final = (event.data as { message: Message }).message
            edit(target, (current) => {
              const at = current.messages.findIndex((m) => m.id === reply)
              if (at >= 0) current.messages[at] = final
            })
          }
        }
      } catch (error) {
        const insufficient = error instanceof ApiError && error.code === "INSUFFICIENT_CREDITS"
        toast.error(
          errorMessage(error, t("error.network")),
          insufficient ? { action: { label: t("images.topup"), onClick: () => navigate("/pricing") } } : undefined,
        )
        if (started) answer((message) => (message.failed = errorMessage(error, t("error.network"))))
        // Refused before any answer (no plan, no credit, today's limit): the words go back to the composer.
        if (!started) {
          edit(target, (current) => {
            current.messages = current.messages.filter((m) => m.id !== asked && m.id !== reply)
          })
          studio.setPrompt(text)
          studio.setReferences(references)
        }
      } finally {
        answer((message) => (message.pending = false))
        edit(target, (current) => (current.sending = false))
      }
    }

    return { thread, load, send }
  },
})
