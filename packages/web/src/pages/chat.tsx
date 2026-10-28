import { useNavigate, useParams } from "@solidjs/router"
import { createEffect, createSignal, For, on, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { createAutoScroll } from "@kiwii/ui/hooks"
import { api, apiStream } from "@/api"
import { ChatEmpty } from "@/components/chat-empty"
import { ChatPromptBar, type Attachment, type ComposerHandle } from "@/components/chat-prompt-bar"
import { IconArrowDown, IconCompose, IconEllipsis, IconPaperclip, IconPencil, IconTrash } from "@/components/icons"
import { Markdown } from "@/components/markdown"
import { MessageView, type Message, type Part } from "@/components/message"
import { TopBar } from "@/components/top-bar"
import { useAuth } from "@/context/auth"
import { useConversations, type Conversation } from "@/context/conversations"
import { useLanguage } from "@/context/language"
import { useLayout } from "@/context/layout"
import { errorMessage } from "@/lib/errors"
import { NEW_CHAT_SHORTCUT, shortcutLabel } from "@/lib/shortcuts"
import { Button } from "@/ui/button"
import { IconButton, iconButtonClass } from "@/ui/icon-button"
import { Menu, MenuContent, MenuItem } from "@/ui/menu"
import { Skeleton } from "@/ui/skeleton"
import { Spinner } from "@/ui/spinner"
import { toast } from "@/ui/toast"

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
  const [failed, setFailed] = createSignal(false)
  const [announce, setAnnounce] = createSignal("")
  const [dragging, setDragging] = createSignal(false)
  let controller: AbortController | undefined
  let composer: ComposerHandle | undefined
  let touchY: number | undefined

  const busy = () => streaming() !== undefined
  const scroll = createAutoScroll({ working: busy })
  // The auto-scroll hook hears the mouse wheel but not fingers. A drag towards older messages has to
  // stop the follow before the scroll event lands, or growing content snaps the view back down.
  const followTouch = (event: TouchEvent) => {
    const y = event.touches[0]?.clientY
    if (touchY !== undefined && y !== undefined && y - touchY > 6) scroll.pause()
  }

  createEffect(
    on(
      () => params.id,
      (id) => {
        // `send` already switched the thread before navigating; reloading here would abort its stream.
        if (id && id === thread.id) return
        controller?.abort()
        setStreaming(undefined)
        setFailed(false)
        if (!id) return setThread({ id: undefined, messages: [] })
        setLoading(true)
        setThread({ id, messages: [] })
        api<{ messages: Message[] }>(`/chat/conversations/${id}/messages`)
          // A slow response for a conversation the person already left must not replace the new one.
          .then((r) => {
            if (params.id !== id) return
            setThread({ id, messages: r.messages })
            requestAnimationFrame(() => scroll.forceScrollToBottom())
          })
          .catch(() => params.id === id && navigate("/chat", { replace: true }))
          .finally(() => params.id === id && setLoading(false))
      },
    ),
  )

  const run = async (id: string, path: string, body: unknown) => {
    controller = new AbortController()
    setStreaming("")
    setCreating(false)
    setFailed(false)
    setAnnounce("")
    let text = ""
    let finished = false
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
          finished = true
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
          setAnnounce(t("chat.answered"))
          void auth.refresh()
        }
      }
    } catch (error) {
      if (controller.signal.aborted) return
      toast.error(errorMessage(error, t("error.network")))
    } finally {
      setStreaming(undefined)
      setCreating(false)
      if (!finished && !controller.signal.aborted && thread.id === id) setFailed(true)
    }
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

  const send = async (text: string, attachments: Attachment[]) => {
    const id = thread.id ?? (await start(text, attachments))
    if (!id) return
    if (thread.messages.length === 0 && text) {
      const title = text.slice(0, 60)
      if (conversations.list()?.find((c) => c.id === id)?.title === DEFAULT_TITLE) {
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

  const quotaExhausted = () => {
    const me = auth.me()
    return !!me && me.plan.chatDailyMessages !== null && me.chatToday >= me.plan.chatDailyMessages
  }
  const current = () => conversations.list()?.find((c) => c.id === params.id)
  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files")

  return (
    <div
      class="relative flex h-full min-h-0 flex-col pb-tabbar"
      onDragEnter={(event) => {
        if (!hasFiles(event) || quotaExhausted()) return
        event.preventDefault()
        setDragging(true)
      }}
      onDragOver={(event) => hasFiles(event) && event.preventDefault()}
      onDragLeave={(event) => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
        setDragging(false)
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return
        event.preventDefault()
        setDragging(false)
        const files = event.dataTransfer?.files
        if (files?.length) composer?.attach(files)
      }}
    >
      <TopBar
        heading
        menu
        title={current()?.title ?? t("nav.chat")}
        trailing={
          <>
            <Show when={current()}>
              {(conversation) => (
                <Menu placement="bottom-end" gutter={6}>
                  <Menu.Trigger
                    aria-label={t("chat.actions", { title: conversation().title })}
                    class={iconButtonClass()}
                  >
                    <IconEllipsis />
                  </Menu.Trigger>
                  <MenuContent>
                    <MenuItem
                      icon={<IconPencil class="size-[18px]" />}
                      onSelect={() => void conversations.rename(conversation())}
                    >
                      {t("chat.rename")}
                    </MenuItem>
                    <MenuItem
                      icon={<IconTrash class="size-[18px]" />}
                      destructive
                      onSelect={() => void conversations.remove(conversation())}
                    >
                      {t("chat.delete")}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              )}
            </Show>
            <Show when={!layout.sidebarVisible()}>
              <IconButton
                label={t("nav.newChat")}
                keys={shortcutLabel(NEW_CHAT_SHORTCUT)}
                icon={<IconCompose />}
                onClick={() => navigate("/chat")}
              />
            </Show>
          </>
        }
      />

      <div class="relative min-h-0 flex-1">
        <div
          ref={scroll.scrollRef}
          class="h-full overflow-y-auto overscroll-contain"
          onScroll={scroll.handleScroll}
          onMouseUp={scroll.handleInteraction}
          onTouchStart={(event) => (touchY = event.touches[0]?.clientY)}
          onTouchMove={followTouch}
        >
          <Show when={thread.id || busy()} fallback={<ChatEmpty onPick={(prompt) => composer?.fill(prompt)} />}>
            <div
              ref={scroll.contentRef}
              class="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 pt-6 pb-8 md:px-6"
              aria-busy={loading() || busy()}
            >
              <Show when={loading()}>
                <div class="flex flex-col gap-6" aria-hidden="true">
                  <Skeleton class="ml-auto h-11 w-2/5 rounded-[20px]" />
                  <div class="flex flex-col gap-2.5">
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
                    last={index() === thread.messages.length - 1}
                    busy={busy()}
                    onRegenerate={() => void regenerate()}
                  />
                )}
              </For>
              <Show when={busy()}>
                <div class="flex flex-col gap-2">
                  <Show
                    when={streaming()}
                    fallback={<span class="k-shimmer-text text-callout font-medium">{t("chat.thinking")}</span>}
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
              <Show when={failed() && !busy()}>
                <div class="flex flex-wrap items-center gap-3 rounded-card bg-danger-soft px-4 py-3" role="alert">
                  <span class="flex-1 text-subhead text-danger">{t("chat.failed")}</span>
                  <Button variant="secondary" size="sm" onClick={() => void regenerate()}>
                    {t("common.retry")}
                  </Button>
                </div>
              </Show>
            </div>
          </Show>
        </div>
        <Show when={scroll.userScrolled()}>
          <span class="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 animate-fade-in">
            <button
              type="button"
              aria-label={t("chat.scrollToBottom")}
              class="flex size-9 items-center justify-center rounded-full bg-elevated text-label shadow-floating transition-transform duration-(--motion-micro) active:scale-95"
              onClick={() => scroll.resume()}
            >
              <IconArrowDown class="size-[18px]" weight={2} />
            </button>
          </span>
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
          handle={(handle) => (composer = handle)}
        />
        <p class="mt-2 hidden text-center text-caption text-label-2 md:block">{t("chat.disclaimer")}</p>
      </div>

      <Show when={dragging()}>
        <div class="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-3 rounded-panel bg-[color-mix(in_srgb,var(--k-canvas)_86%,transparent)] shadow-[inset_0_0_0_2px_var(--k-accent-brand)] backdrop-blur-sm animate-fade-in">
          <span class="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
            <IconPaperclip class="size-6" />
          </span>
          <p class="text-headline text-label">{t("chat.dropFiles")}</p>
        </div>
      </Show>

      <div class="sr-only" aria-live="polite">
        {announce()}
      </div>
    </div>
  )
}
