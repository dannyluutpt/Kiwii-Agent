import { useLocation, useNavigate } from "@solidjs/router"
import { createResource, createSignal } from "solid-js"
import { createSimpleContext } from "@kiwii/ui/context/helper"
import { api } from "@/api"
import { useLanguage } from "@/context/language"
import { errorMessage } from "@/lib/errors"
import { askConfirm, askText } from "@/ui/confirm"
import { toast } from "@/ui/toast"

export type Conversation = { id: string; title: string; lastMessageAt: number }

// Conversation list shared by the sidebar and the chat screen, with the rename/delete flows both
// of them offer.
export const { use: useConversations, provider: ConversationsProvider } = createSimpleContext({
  name: "Conversations",
  init: () => {
    const { t } = useLanguage()
    const navigate = useNavigate()
    const location = useLocation()
    const [failed, setFailed] = createSignal(false)
    const [list, { mutate, refetch }] = createResource(() => {
      setFailed(false)
      return api<{ conversations: Conversation[] }>("/chat/conversations")
        .then((r) => r.conversations)
        .catch(() => {
          setFailed(true)
          return [] as Conversation[]
        })
    })
    const patch = (id: string, fields: Partial<Conversation>) =>
      mutate((items) => items?.map((c) => (c.id === id ? { ...c, ...fields } : c)))

    return {
      list,
      failed,
      refetch,
      patch,
      add: (conversation: Conversation) => {
        mutate((items) => [conversation, ...(items ?? []).filter((c) => c.id !== conversation.id)])
      },
      rename: async (conversation: Conversation) => {
        const title = await askText({
          title: t("chat.renameTitle"),
          label: t("chat.rename"),
          value: conversation.title,
          confirmLabel: t("common.save"),
          maxLength: 120,
        })
        if (!title || title === conversation.title) return
        patch(conversation.id, { title })
        await api(`/chat/conversations/${conversation.id}`, { method: "PATCH", body: { title } }).catch(
          (error: unknown) => {
            patch(conversation.id, { title: conversation.title })
            toast.error(errorMessage(error, t("error.network")))
          },
        )
      },
      remove: async (conversation: Conversation) => {
        const ok = await askConfirm({
          title: t("chat.deleteTitle"),
          description: t("chat.deleteDescription", { title: conversation.title }),
          confirmLabel: t("common.delete"),
          destructive: true,
        })
        if (!ok) return
        await api(`/chat/conversations/${conversation.id}`, { method: "DELETE" })
          .then(() => {
            mutate((items) => items?.filter((c) => c.id !== conversation.id))
            if (location.pathname === `/chat/${conversation.id}`) navigate("/chat")
          })
          .catch((error: unknown) => toast.error(errorMessage(error, t("error.network"))))
      },
    }
  },
})
