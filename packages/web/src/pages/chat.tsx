import { A, useNavigate, useParams } from "@solidjs/router"
import { createEffect, createResource, createSignal, For, on, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { IconButton } from "@kiwii/ui/icon-button"
import { Spinner } from "@kiwii/ui/spinner"
import { showToast } from "@kiwii/ui/toast"
import { Tooltip } from "@kiwii/ui/tooltip"
import { api, ApiError, apiStream } from "@/api"
import { ChatPromptBar } from "@/components/chat-prompt-bar"
import { Markdown } from "@/components/markdown"
import { useAuth } from "@/context/auth"
import { useLanguage } from "@/context/language"

type Conversation = { id: string; title: string; lastMessageAt: number }
type Part = { type: "text"; text: string } | { type: "file"; name: string } | { type: "tool"; name: string }
type Message = { id: string; role: "user" | "assistant"; parts: Part[]; createdAt: number }

const NEW_TITLE = "Hội thoại mới"

export default function Chat() {
  const { t } = useLanguage()
  const auth = useAuth()
  const params = useParams<{ id?: string }>()
  const navigate = useNavigate()

  const [conversations, { refetch: refetchConversations, mutate: mutateConversations }] = createResource(() =>
    api<{ conversations: Conversation[] }>("/chat/conversations").then((r) => r.conversations),
  )
  const [thread, setThread] = createStore<{ id?: string; messages: Message[] }>({ messages: [] })
  const [loading, setLoading] = createSignal(false)
  const [streaming, setStreaming] = createSignal<string>()
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
        api<{ messages: Message[] }>(`/chat/conversations/${id}/messages`)
          .then((r) => setThread({ id, messages: r.messages }))
          .catch(() => navigate("/chat", { replace: true }))
          .finally(() => setLoading(false))
      },
    ),
  )

  const run = async (id: string, path: string, body: unknown) => {
    controller = new AbortController()
    setStreaming("")
    let text = ""
    try {
      for await (const event of apiStream(path, body, controller.signal)) {
        if (event.event === "text-delta") {
          text += (event.data as { text: string }).text
          setStreaming(text)
          continue
        }
        if (event.event === "error") {
          showToast({ title: (event.data as { message: string }).message, variant: "error" })
          continue
        }
        if (event.event === "finish") {
          const data = event.data as { messageID: string }
          if (thread.id === id) {
            setThread(
              produce((s) => {
                s.messages.push({
                  id: data.messageID,
                  role: "assistant",
                  parts: [{ type: "text", text }],
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
      showToast({ title: error instanceof ApiError ? error.message : t("error.network"), variant: "error" })
    } finally {
      setStreaming(undefined)
    }
  }

  const send = async (text: string) => {
    let id = thread.id
    if (!id) {
      const created = await api<Conversation>("/chat/conversations", { body: { title: text.slice(0, 60) } })
      mutateConversations((list) => [created, ...(list ?? [])])
      id = created.id
      setThread({ id, messages: [] })
      navigate(`/chat/${id}`)
    }
    const current = id
    if (thread.messages.length === 0) {
      const title = text.slice(0, 60)
      mutateConversations((list) => list?.map((c) => (c.id === current && c.title === NEW_TITLE ? { ...c, title } : c)))
      void api(`/chat/conversations/${current}`, { method: "PATCH", body: { title } }).catch(() => {})
    }
    setThread(
      produce((s) => {
        s.messages.push({
          id: `local-${Date.now()}`,
          role: "user",
          parts: [{ type: "text", text }],
          createdAt: Date.now(),
        })
      }),
    )
    await run(current, `/chat/conversations/${current}/messages`, { text })
    void refetchConversations()
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

  const remove = async (conversation: Conversation) => {
    if (!confirm(t("chat.deleteConfirm"))) return
    await api(`/chat/conversations/${conversation.id}`, { method: "DELETE" })
    mutateConversations((list) => list?.filter((c) => c.id !== conversation.id))
    if (thread.id === conversation.id) navigate("/chat")
  }

  const rename = async (conversation: Conversation) => {
    const title = prompt(t("chat.rename"), conversation.title)?.trim()
    if (!title || title === conversation.title) return
    await api(`/chat/conversations/${conversation.id}`, { method: "PATCH", body: { title } })
    mutateConversations((list) => list?.map((c) => (c.id === conversation.id ? { ...c, title } : c)))
  }

  const busy = () => streaming() !== undefined
  const quotaExhausted = () => {
    const me = auth.me()
    return !!me && me.plan.chatDailyMessages !== null && me.chatToday >= me.plan.chatDailyMessages
  }

  return (
    <div class="flex h-full min-h-0">
      <aside class="flex w-64 shrink-0 flex-col border-r border-border-weak-base">
        <div class="flex items-center justify-between px-3 pt-3 pb-2">
          <span class="text-12-medium uppercase tracking-wide text-text-weak">{t("nav.chat")}</span>
          <Tooltip value={t("nav.newChat")}>
            <IconButton
              icon="plus-small"
              variant="ghost"
              size="small"
              onClick={() => navigate("/chat")}
              aria-label={t("nav.newChat")}
            />
          </Tooltip>
        </div>
        <ul class="flex-1 overflow-y-auto px-2 pb-2">
          <Show when={conversations()?.length === 0}>
            <li class="px-2 py-6 text-center text-13-regular text-text-weak">{t("chat.noConversations")}</li>
          </Show>
          <For each={conversations()}>
            {(conversation) => (
              <li class="group/item relative">
                <A
                  href={`/chat/${conversation.id}`}
                  class="block truncate rounded-md py-2 pl-2.5 pr-14 text-14-regular text-text-base hover:bg-surface-raised-base-hover hover:text-text-strong"
                  classList={{ "bg-surface-raised-base text-text-strong": thread.id === conversation.id }}
                >
                  {conversation.title}
                </A>
                <span class="absolute inset-y-0 right-1 hidden items-center gap-0.5 group-hover/item:flex">
                  <IconButton
                    icon="pencil-line"
                    variant="ghost"
                    size="small"
                    aria-label={t("chat.rename")}
                    onClick={() => void rename(conversation)}
                  />
                  <IconButton
                    icon="trash"
                    variant="ghost"
                    size="small"
                    aria-label={t("chat.delete")}
                    onClick={() => void remove(conversation)}
                  />
                </span>
              </li>
            )}
          </For>
        </ul>
      </aside>

      <section class="flex min-w-0 flex-1 flex-col">
        <div class="flex-1 overflow-y-auto">
          <Show
            when={thread.id || busy()}
            fallback={
              <div class="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <h1 class="text-20-medium text-text-strong">{t("chat.empty.title")}</h1>
                <p class="max-w-md text-14-regular text-text-weak">{t("chat.empty.lead")}</p>
              </div>
            }
          >
            <div class="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-6">
              <Show when={loading()}>
                <Spinner class="size-5 text-icon-base" />
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
                    fallback={<span class="text-13-regular text-text-weak">{t("chat.thinking")}</span>}
                  >
                    <Markdown text={streaming()!} />
                  </Show>
                </div>
              </Show>
            </div>
          </Show>
        </div>
        <div class="px-4 pb-4 pt-2">
          <Show when={quotaExhausted()}>
            <p class="mx-auto mb-2 max-w-3xl text-center text-13-regular text-text-on-warning-base">
              {t("chat.quotaDaily", { time: "00:00" })}
            </p>
          </Show>
          <ChatPromptBar
            busy={busy()}
            disabled={quotaExhausted()}
            onSend={(text) => void send(text)}
            onStop={() => controller?.abort()}
          />
          <p class="mt-2 text-center text-12-regular text-text-weaker">{t("chat.disclaimer")}</p>
        </div>
      </section>
    </div>
  )
}

function MessageView(props: { message: Message; last: boolean; onRegenerate: () => void }) {
  const { t } = useLanguage()
  const text = () =>
    props.message.parts
      .map((part) => (part.type === "text" ? part.text : part.type === "file" ? `[${part.name}]` : ""))
      .join("\n\n")
  return (
    <Show
      when={props.message.role === "assistant"}
      fallback={
        <div class="flex justify-end">
          <div class="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-surface-raised-strong px-4 py-2.5 text-14-regular text-text-strong">
            {text()}
          </div>
        </div>
      }
    >
      <div class="group/message flex flex-col gap-1.5">
        <Markdown text={text()} />
        <Show when={props.last}>
          <div class="flex items-center gap-1">
            <Tooltip value={t("chat.regenerate")}>
              <IconButton
                icon="reset"
                variant="ghost"
                size="small"
                aria-label={t("chat.regenerate")}
                onClick={() => props.onRegenerate()}
              />
            </Tooltip>
          </div>
        </Show>
      </div>
    </Show>
  )
}
