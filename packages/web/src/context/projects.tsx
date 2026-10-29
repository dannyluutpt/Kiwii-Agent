import { useLocation, useNavigate } from "@solidjs/router"
import { createResource, createSignal } from "solid-js"
import { createSimpleContext } from "@kiwii/ui/context/helper"
import { api } from "@/api"
import { useLanguage } from "@/context/language"
import { errorMessage } from "@/lib/errors"
import { askConfirm, askText } from "@/ui/confirm"
import { toast } from "@/ui/toast"

// An empty name means "not named yet": the first run in the project names it after its prompt.
export type Project = { id: string; name: string; createdAt: number; updatedAt: number }

export const projectPath = (id: string) => `/p/${id}`

// The project list behind the sidebar, with the create, rename and delete flows.
export const { use: useProjects, provider: ProjectsProvider } = createSimpleContext({
  name: "Projects",
  init: () => {
    const { t } = useLanguage()
    const navigate = useNavigate()
    const location = useLocation()
    const [failed, setFailed] = createSignal(false)
    const [creating, setCreating] = createSignal(false)
    const [list, { mutate, refetch }] = createResource(() => {
      setFailed(false)
      return api<{ projects: Project[] }>("/projects")
        .then((r) => r.projects)
        .catch(() => {
          setFailed(true)
          return [] as Project[]
        })
    })
    const find = (id: string | undefined) => (id ? list.latest?.find((p) => p.id === id) : undefined)
    const label = (project: Project) => project.name || t("projects.untitled")
    const patch = (id: string, fields: Partial<Project>) =>
      mutate((items) => items?.map((p) => (p.id === id ? { ...p, ...fields } : p)))

    return {
      list,
      failed,
      refetch,
      creating,
      find,
      label,
      // Opens a new project (or the empty, unnamed one the server hands back) and resolves with it.
      create: async () => {
        if (creating()) return undefined
        setCreating(true)
        const project = await api<Project>("/projects", { body: {} })
          .then((project) => {
            mutate((items) => [project, ...(items ?? []).filter((p) => p.id !== project.id)])
            navigate(projectPath(project.id))
            return project
          })
          .catch((error: unknown) => {
            toast.error(errorMessage(error, t("error.network")))
            return undefined
          })
        setCreating(false)
        return project
      },
      rename: async (project: Project) => {
        const name = await askText({
          title: t("projects.renameTitle"),
          label: t("projects.rename"),
          value: project.name,
          confirmLabel: t("common.save"),
          maxLength: 80,
        })
        if (!name || name === project.name) return
        patch(project.id, { name })
        await api(`/projects/${project.id}`, { method: "PATCH", body: { name } }).catch((error: unknown) => {
          patch(project.id, { name: project.name })
          toast.error(errorMessage(error, t("error.network")))
        })
      },
      remove: async (project: Project) => {
        const ok = await askConfirm({
          title: t("projects.deleteTitle"),
          description: t("projects.deleteDescription", { name: label(project) }),
          confirmLabel: t("common.delete"),
          destructive: true,
        })
        if (!ok) return
        await api(`/projects/${project.id}`, { method: "DELETE" })
          .then(() => {
            mutate((items) => items?.filter((p) => p.id !== project.id))
            if (location.pathname === projectPath(project.id)) navigate("/")
          })
          .catch((error: unknown) => toast.error(errorMessage(error, t("error.network"))))
      },
      // A run started in the project: it moves to the top, and an unnamed one now has a name.
      touched: () => void refetch(),
    }
  },
})
