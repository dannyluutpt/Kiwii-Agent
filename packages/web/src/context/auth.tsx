import { createResource } from "solid-js"
import { createSimpleContext } from "@kiwii/ui/context/helper"
import { api, ApiError } from "@/api"

export type Me = {
  user: { id: string; email: string; locale: string; createdAt: number }
  tier: "free" | "starter" | "plus" | "ultra"
  tierUntil: number | null
  plan: {
    id: string
    name: string
    credits: number
    chatDailyMessages: number | null
    chatMonthlyMessages: number | null
  }
  credits: number
  chatToday: number
}

async function fetchMe() {
  return api<Me>("/auth/me").catch((error: unknown) => {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  })
}

export const { use: useAuth, provider: AuthProvider } = createSimpleContext({
  name: "Auth",
  // Children render only once /auth/me has answered so guards never flash the wrong screen.
  gate: true,
  init: () => {
    const [me, { refetch, mutate }] = createResource(fetchMe)
    return {
      me,
      ready: () => me.state === "ready" || me.state === "errored",
      refresh: () => refetch(),
      clear: () => mutate(null),
      async logout() {
        await api("/auth/logout", { method: "POST", body: {} })
        mutate(null)
      },
    }
  },
})
