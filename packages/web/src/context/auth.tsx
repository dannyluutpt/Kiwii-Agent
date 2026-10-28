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

// A signed-out visitor gets 401. Anything else (rate limit, a dropped connection, a cold start) is
// retried twice with a short back-off before the app shows the offline screen.
async function fetchMe(attempt = 0): Promise<Me | null> {
  return api<Me>("/auth/me").catch(async (error: unknown) => {
    if (error instanceof ApiError && error.status === 401) return null
    if (attempt >= 2) throw error
    await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)))
    return fetchMe(attempt + 1)
  })
}

export const { use: useAuth, provider: AuthProvider } = createSimpleContext({
  name: "Auth",
  // Route guards wait on `ready` and show the splash meanwhile, so the provider itself never blocks.
  gate: false,
  init: () => {
    const [me, { refetch, mutate }] = createResource(() => fetchMe())
    return {
      // Reading an errored resource throws; guards check `failed` first and never get here then.
      // `latest` keeps the last answer during a refresh without suspending the screen that reads it.
      me: () => (me.error ? undefined : me.latest),
      // Ready once the first answer is in. A refresh (after each chat answer or image run) must not
      // count as loading, or the route guards would swap the whole app for the splash and remount it.
      ready: () => me.state === "ready" || me.state === "refreshing" || me.state === "errored",
      failed: () => !!me.error,
      refresh: () => refetch(),
      clear: () => mutate(null),
      logout: async () => {
        await api("/auth/logout", { method: "POST", body: {} })
        mutate(null)
      },
    }
  },
})
