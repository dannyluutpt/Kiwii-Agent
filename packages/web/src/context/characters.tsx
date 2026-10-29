import { createResource, createSignal } from "solid-js"
import { createSimpleContext } from "@kiwii/ui/context/helper"
import { api } from "@/api"
import { useLanguage } from "@/context/language"
import type { Character, Reference } from "@/images"
import { errorMessage } from "@/lib/errors"
import { askConfirm, askText } from "@/ui/confirm"
import { toast } from "@/ui/toast"

// The account's saved characters, the ones picked for the next pictures, and the dialog that saves
// a new one from photos.
export const { use: useCharacters, provider: CharactersProvider } = createSimpleContext({
  name: "Characters",
  init: () => {
    const { t } = useLanguage()
    const [list, { mutate }] = createResource(() =>
      api<{ characters: Character[] }>("/characters")
        .then((r) => r.characters)
        .catch(() => [] as Character[]),
    )
    // Picked characters stay picked from one message to the next until the person takes them off.
    const [picked, setPicked] = createSignal<string[]>([])
    // The photos of a character being saved; the dialog is open while this is set.
    const [draft, setDraft] = createSignal<Reference[]>()
    const find = (id: string) => list.latest?.find((c) => c.id === id)
    const unpick = (id: string) => setPicked((ids) => ids.filter((item) => item !== id))

    return {
      list,
      find,
      // Picks a deleted character no longer counts.
      picked: () => picked().filter((id) => find(id)),
      // Picks the character, or takes it off when it is picked already.
      pick: (id: string, max: number) => {
        const current = picked().filter((item) => find(item))
        if (current.includes(id)) {
          unpick(id)
          return
        }
        if (current.length >= max) {
          toast.error(t("characters.limit", { n: max }))
          return
        }
        setPicked([...current, id])
      },
      unpick,
      draft,
      // Opens the dialog that saves a character, with these photos in it.
      compose: (photos: Reference[] = []) => setDraft(photos),
      closeDraft: () => setDraft(undefined),
      create: async (name: string, fileIDs: string[]) => {
        const made = await api<Character>("/characters", { body: { name, fileIDs } }).catch((error: unknown) => {
          toast.error(errorMessage(error, t("error.network")))
          return undefined
        })
        if (made) mutate((items) => [made, ...(items ?? [])])
        return made
      },
      rename: async (character: Character) => {
        const name = await askText({
          title: t("characters.renameTitle"),
          label: t("characters.name"),
          value: character.name,
          confirmLabel: t("common.save"),
          maxLength: 40,
        })
        if (!name || name === character.name) return
        await api<Character>(`/characters/${character.id}`, { method: "PATCH", body: { name } })
          .then((saved) => mutate((items) => items?.map((c) => (c.id === saved.id ? saved : c))))
          .catch((error: unknown) => toast.error(errorMessage(error, t("error.network"))))
      },
      remove: async (character: Character) => {
        const ok = await askConfirm({
          title: t("characters.deleteTitle"),
          description: t("characters.deleteDescription", { name: character.name }),
          confirmLabel: t("common.delete"),
          destructive: true,
        })
        if (!ok) return
        await api(`/characters/${character.id}`, { method: "DELETE" })
          .then(() => {
            mutate((items) => items?.filter((c) => c.id !== character.id))
            unpick(character.id)
          })
          .catch((error: unknown) => toast.error(errorMessage(error, t("error.network"))))
      },
    }
  },
})
