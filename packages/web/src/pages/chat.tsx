import { useNavigate, useParams } from "@solidjs/router"
import { createEffect, createSignal, For, on, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { api, apiStream } from "@/api"
import { ChatPromptBar, type Attachment } from "@/components/chat-prompt-bar"
import { IconCompose, IconDocument, IconRefresh } from "@/components/icons"
import { Markdown } from "@/components/markdown"
import { TopBar } from "@/components/top-bar"
import { useAuth } from "@/context/auth"
import { useConversations, type Conversation } from "@/context/conversations"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { errorMessage } from "@/lib/errors"
import { NEW_CHAT_SHORTCUT, shortcutLabel } from "@/lib/shortcuts"
import { IconButton } from "@/ui/icon-button"
import { Skeleton } from "@/ui/skeleton"
import { Spinner } from "@/ui/spinner"
import { toast } from "@/ui/toast"

type Part =
  | { type: "text"; text: string }
  | { type: "file"; file_id: string; name: string; mime: string; size: number }
  | { type: "tool"; name: string }
type Message = { id: string; role: "user" | "assistant"; parts: Part[]; createdAt: number }

// Title the API gives a conversation created without one; replaced by the first message.
const DEFAULT_TITLE = "Hội thoại mới"

export default function Chat() {
  const { t } = useLanguage()
  const auth = useAuth()
  const layout = useLayout()
  const conversations = useConversations()
  const params = useParams<{ id?: string }>()
  const navigate = useNavigate()

  const [thread, setThread] = createStore<{ id?: string; messages: Message[] }>({ messages: [] })
  const [loading, setLoading] = createSignal(false)
  const [streaming, setStreaming] = createSignal<string>()
  const [creating, setCreating] = createSignal(false)
  let controller: AbortController | undefined

  createEffect(
    on(
      () => params.id,
      (id) => {
        // `send` already switched the thread before navigating; reloading here would abort its stream.
        if (id && id === thread.id) return
        controller?.abort()
        setStreaming(undefined)
        if (!id) return setThread({ id: undefined, messages: [] })
        setLoading(true)
        setThread({ id, messages: [] })
        api<{ messages: Message[] }>(`/chat/conversations/${id}/messages`)
          // A slow response for a conversation the person already left must not replace the new one.
          .then((r) => params.id === id && setThread({ id, messages: r.messages }))
          .catch(() => params.id === id && navigate("/chat", { replace: true }))
          .finally(() => params.id === id && setLoading(false))
      },
    ),
  )

  const run = async (id: string, path: string, body: unknown) => {
    controller = new AbortController()
    setStreaming("")
    setCreating(false)
    let text = ""
    try {
      for await (const event of apiStream(path, body, controller.signal)) {
        if (event.event === "text-delta") {
          text += (event.data as { text: string }).text
          setStreaming(text)
          continue
        }
        if (event.event === "tool-call") {
          setCreating(true)
          continue
        }
        if (event.event === "tool-result") {
          setCreating(false)
          const data = event.data as { error: string | null }
          if (data.error) toast.error(data.error)
          if (text) text += "\n\n"
          continue
        }
        if (event.event === "error") {
          toast.error((event.data as { message: string }).message)
          continue
        }
        if (event.event === "finish") {
          const data = event.data as { messageID: string; parts?: Part[] }
          if (thread.id === id) {
            setThread(
              produce((s) => {
                s.messages.push({
                  id: data.messageID,
                  role: "assistant",
                  parts: data.parts ?? [{ type: "text", text }],
                  createdAt: Date.now(),
                })
              }),
            )
          }
          void auth.refresh()
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return
      toast.error(errorMessage(error, t("error.network")))
    } finally {
      setStreaming(undefined)
      setCreating(false)
    }
  }

  const send = async (text: string, attachments: Attachment[]) => {
    const id = thread.id ?? (await start(text, attachments))
    if (!id) return
    if (thread.messages.length === 0 && text) {
      const title = text.slice(0, 60)
      const current = conversations.list()?.find((c) => c.id === id)
      if (current?.title === DEFAULT_TITLE) {
        conversations.patch(id, { title })
        void api(`/chat/conversations/${id}`, { method: "PATCH", body: { title } }).catch(() => {})
      }
    }
    setThread(
      produce((s) => {
        s.messages.push({
          id: `local-${Date.now()}`,
          role: "user",
          parts: [
            ...(text ? [{ type: "text" as const, text }] : []),
            ...attachments.map((a) => ({
              type: "file" as const,
              file_id: a.id,
              name: a.name,
              mime: a.mime,
              size: a.size,
            })),
          ],
          createdAt: Date.now(),
        })
      }),
    )
    await run(id, `/chat/conversations/${id}/messages`, { text, fileIDs: attachments.map((a) => a.id) })
    void conversations.refetch()
  }

  const start = async (text: string, attachments: Attachment[]) => {
    const created = await api<Conversation>("/chat/conversations", {
      body: { title: (text || attachments[0]?.name || "").slice(0, 60) },
    }).catch((error: unknown) => {
      toast.error(errorMessage(error, t("error.network")))
      return undefined
    })
    if (!created) return undefined
    conversations.add(created)
    setThread({ id: created.id, messages: [] })
    navigate(`/chat/${created.id}`)
    return created.id
  }

  const regenerate = async () => {
    const id = thread.id
    if (!id) return
    setThread(
      produce((s) => {
        if (s.messages.at(-1)?.role === "assistant") s.messages.pop()
      }),
    )
    await run(id, `/chat/conversations/${id}/regenerate`, {})
  }

  const busy = () => streaming() !== undefined
  const quotaExhausted = () => {
    const me = auth.me()
    return !!me && me.plan.chatDailyMessages !== null && me.chatToday >= me.plan.chatDailyMessages
  }
  const title = () => conversations.list()?.find((c) => c.id === params.id)?.title ?? t("nav.chat")

  return (
    <div class="flex h-full min-h-0 flex-col pb-tabbar">
      <TopBar
        heading
        menu
        title={title()}
        trailing={
          <Show when={!layout.sidebarVisible()}>
            <IconButton
              label={t("nav.newChat")}
              keys={shortcutLabel(NEW_CHAT_SHORTCUT)}
              icon={<IconCompose />}
              onClick={() => navigate("/chat")}
            />
          </Show>
        }
      />
      <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <Show
          when={thread.id || busy()}
          fallback={
            <div class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
              <img src="/logo.png" alt="" class="mb-2 size-12 rounded-[14px] shadow-raised" />
              <h2 class="text-title-2 text-label">{t("chat.empty.title")}</h2>
              <p class="max-w-md text-callout text-label-2">{t("chat.empty.lead")}</p>
            </div>
          }
        >
          <div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6 md:px-6" aria-busy={loading() || busy()}>
            <Show when={loading()}>
              <div class="flex flex-col gap-6" aria-hidden="true">
                <Skeleton class="ml-auto h-10 w-2/5 rounded-card" />
                <div class="flex flex-col gap-2">
                  <Skeleton class="h-4 w-11/12" />
                  <Skeleton class="h-4 w-4/5" />
                  <Skeleton class="h-4 w-3/5" />
                </div>
              </div>
            </Show>
            <For each={thread.messages}>
              {(message, index) => (
                <MessageView
                  message={message}
                  last={index() === thread.messages.length - 1 && !busy()}
                  onRegenerate={() => void regenerate()}
                />
              )}
            </For>
            <Show when={busy()}>
              <div class="flex flex-col gap-2">
                <Show
                  when={streaming()}
                  fallback={
                    <span class="flex items-center gap-2 text-subhead text-label-2">
                      <Spinner class="size-4" /> {t("chat.thinking")}
                    </span>
                  }
                >
                  <Markdown text={streaming()!} />
                </Show>
                <Show when={creating()}>
                  <span class="flex items-center gap-2 text-subhead text-label-2">
                    <Spinner class="size-4" /> {t("chat.creatingFile")}
                  </span>
                </Show>
              </div>
            </Show>
          </div>
        </Show>
      </div>
      <div class="mx-auto w-full max-w-3xl px-3 pt-1 pb-3 md:px-6 md:pb-4">
        <Show when={quotaExhausted()}>
          <p class="mb-2 text-center text-footnote text-warning" role="status">
            {t("chat.quotaDaily", { time: "00:00" })}
          </p>
        </Show>
        <ChatPromptBar
          busy={busy()}
          disabled={quotaExhausted()}
          onSend={(text, attachments) => void send(text, attachments)}
          onStop={() => controller?.abort()}
        />
        <p class="mt-2 hidden text-center text-caption text-label-2 md:block">{t("chat.disclaimer")}</p>
      </div>
    </div>
  )
}

function MessageView(props: { message: Message; last: boolean; onRegenerate: () => void }) {
  const { t } = useLanguage()
  const text = () =>
    props.message.parts
      .map((part) => (part.type === "text" ? part.text : ""))
      .filter(Boolean)
      .join("\n\n")
  const files = () =>
    props.message.parts.filter((part): part is Extract<Part, { type: "file" }> => part.type === "file")
  return (
    <Show
      when={props.message.role === "assistant"}
      fallback={
        <div class="flex flex-col items-end gap-1.5">
          <Show when={files().length > 0}>
            <div class="flex max-w-[85%] flex-wrap justify-end gap-1.5">
              <For each={files()}>{(file) => <FileCard file={file} />}</For>
            </div>
          </Show>
          <Show when={text()}>
            <div class="max-w-[85%] rounded-card rounded-br-[6px] bg-surface-2 px-4 py-2.5 text-body whitespace-pre-wrap text-label">
              {text()}
            </div>
          </Show>
        </div>
      }
    >
      <div class="flex flex-col gap-2">
        <Show when={text()}>
          <Markdown text={text()} />
        </Show>
        <Show when={files().length > 0}>
          <div class="flex flex-wrap gap-2">
            <For each={files()}>{(file) => <FileCard file={file} />}</For>
          </div>
        </Show>
        <Show when={props.last}>
          <div class="-ml-2 flex items-center gap-1">
            <IconButton
              label={t("chat.regenerate")}
              size="sm"
              icon={<IconRefresh class="size-[18px]" />}
              onClick={() => props.onRegenerate()}
            />
          </div>
        </Show>
      </div>
    </Show>
  )
}

function FileCard(props: { file: Extract<Part, { type: "file" }> }) {
  const { t } = useLanguage()
  const size = () =>
    props.file.size > 1024 * 1024
      ? `${(props.file.size / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(props.file.size / 1024))} KB`
  return (
    <a
      href={`/api/chat/files/${props.file.file_id}`}
      download={props.file.name}
      class="flex max-w-full items-center gap-3 rounded-card bg-surface px-3 py-2.5 shadow-raised transition-[color,background-color] hover:bg-surface-2"
      aria-label={`${props.file.name}, ${size()}, ${t("chat.download")}`}
    >
      <span class="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-accent-soft text-accent">
        <IconDocument class="size-5" />
      </span>
      <span class="flex min-w-0 flex-col">
        <span class="max-w-56 truncate text-subhead font-medium text-label">{props.file.name}</span>
        <span class="text-caption text-label-2">
          {size()} · {t("chat.download")}
        </span>
      </span>
    </a>
  )
}
