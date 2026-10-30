import { createResource, createSignal } from "solid-js"
import { api } from "@/api"
import { useLanguage } from "@/context/language"
import type { Reference, Saved } from "@/images"
import { errorMessage } from "@/lib/errors"
import { askConfirm, askText } from "@/ui/confirm"
import { toast } from "@/ui/toast"

// Characters and locations work alike. `kind` is their API path, the key of the list it returns and
// the prefix of their words in the dictionaries.
export type SavedKind = "characters" | "locations"

// The account's saved characters or locations, the ones picked for the next pictures, and the dialog
// that saves a new one from photos.
export function createSaved(kind: SavedKind) {
  const { t } = useLanguage()
  const [list, { mutate }] = createResource(() =>
    api<Partial<Record<SavedKind, Saved[]>>>(`/${kind}`)
      .then((r) => r[kind] ?? [])
      .catch(() => [] as Saved[]),
  )
  // Picks stay picked from one message to the next until the person takes them off.
  const [picked, setPicked] = createSignal<string[]>([])
  // The photos of one being saved; the dialog is open while this is set.
  const [draft, setDraft] = createSignal<Reference[]>()
  const find = (id: string) => list.latest?.find((item) => item.id === id)
  const unpick = (id: string) => setPicked((ids) => ids.filter((item) => item !== id))

  return {
    kind,
    list,
    find,
    // A deleted one no longer counts.
    picked: () => picked().filter((id) => find(id)),
    // Picks it, or takes it off when it is picked already. Where a run takes only one, the new pick
    // takes the place of the old.
    pick: (id: string, max: number) => {
      const current = picked().filter((item) => find(item))
      if (current.includes(id)) {
        unpick(id)
        return
      }
      if (current.length >= max && max > 1) {
        toast.error(t(`${kind}.limit`, { n: max }))
        return
      }
      setPicked([...current, id].slice(-max))
    },
    unpick,
    draft,
    // Opens the dialog that saves one, with these photos in it.
    compose: (photos: Reference[] = []) => setDraft(photos),
    closeDraft: () => setDraft(undefined),
    create: async (name: string, fileIDs: string[]) => {
      const made = await api<Saved>(`/${kind}`, { body: { name, fileIDs } }).catch((error: unknown) => {
        toast.error(errorMessage(error, t("error.network")))
        return undefined
      })
      if (made) mutate((items) => [made, ...(items ?? [])])
      return made
    },
    rename: async (item: Saved) => {
      const name = await askText({
        title: t(`${kind}.renameTitle`),
        label: t(`${kind}.name`),
        value: item.name,
        confirmLabel: t("common.save"),
        maxLength: 40,
      })
      if (!name || name === item.name) return
      await api<Saved>(`/${kind}/${item.id}`, { method: "PATCH", body: { name } })
        .then((saved) => mutate((items) => items?.map((c) => (c.id === saved.id ? saved : c))))
        .catch((error: unknown) => toast.error(errorMessage(error, t("error.network"))))
    },
    remove: async (item: Saved) => {
      const ok = await askConfirm({
        title: t(`${kind}.deleteTitle`),
        description: t(`${kind}.deleteDescription`, { name: item.name }),
        confirmLabel: t("common.delete"),
        destructive: true,
      })
      if (!ok) return
      await api(`/${kind}/${item.id}`, { method: "DELETE" })
        .then(() => {
          mutate((items) => items?.filter((c) => c.id !== item.id))
          unpick(item.id)
        })
        .catch((error: unknown) => toast.error(errorMessage(error, t("error.network"))))
    },
  }
}

export type SavedStore = ReturnType<typeof createSaved>
