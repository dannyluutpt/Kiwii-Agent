import { createEffect, createSignal, For, Show } from "solid-js"
import { useCharacters } from "@/context/characters"
import { useLanguage } from "@/context/language"
import type { Reference } from "@/images"
import { Button } from "@/ui/button"
import { Dialog } from "@/ui/dialog"
import { IconButton } from "@/ui/icon-button"
import { Spinner } from "@/ui/spinner"
import { TextField } from "@/ui/text-field"
import { toast } from "@/ui/toast"
import { IconClose, IconPlus } from "./icons"
import { createReferenceUploads } from "./references"

const MAX_PHOTOS = 4
// Plenty for a face to be recognised; a larger photo only costs more to read on every run.
const PHOTO_EDGE = 2048

// Saves a character from one to four photos: uploads, or pictures the account made, which the
// gallery and the viewer open it with. The server keeps its own copies of them.
export function CharacterDialog(props: { max: number }) {
  const { t } = useLanguage()
  const characters = useCharacters()
  const [name, setName] = createSignal("")
  const [photos, setPhotos] = createSignal<Reference[]>([])
  const [saving, setSaving] = createSignal(false)
  let fileInput: HTMLInputElement | undefined
  const uploads = createReferenceUploads({
    references: photos,
    onReferences: setPhotos,
    maxCount: () => MAX_PHOTOS,
    maxEdge: () => PHOTO_EDGE,
  })

  // Each opening starts from the photos it was opened with.
  createEffect(() => {
    const draft = characters.draft()
    if (!draft) return
    setName("")
    setPhotos(draft.slice(0, MAX_PHOTOS))
  })

  const canSave = () => name().trim().length > 0 && photos().length > 0 && !uploads.uploading() && !saving()
  const save = async () => {
    if (!canSave()) return
    setSaving(true)
    const made = await characters.create(
      name().trim(),
      photos().map((photo) => photo.id),
    )
    setSaving(false)
    if (!made) return
    characters.closeDraft()
    toast.success(t("characters.saved", { name: made.name }), {
      action: { label: t("characters.use"), onClick: () => characters.pick(made.id, props.max) },
    })
  }

  return (
    <Dialog
      open={characters.draft() !== undefined}
      onOpenChange={(open) => !open && characters.closeDraft()}
      title={t("characters.create")}
      description={t("characters.lead")}
      actions={
        <>
          <Button variant="secondary" onClick={() => characters.closeDraft()}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" disabled={!canSave()} loading={saving()} onClick={() => void save()}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form
        class="mt-4 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <TextField
          label={t("characters.name")}
          placeholder={t("characters.namePlaceholder")}
          value={name()}
          onChange={setName}
          maxLength={40}
          autocapitalize="words"
        />
        <div class="flex flex-col gap-1.5">
          <p class="text-subhead font-medium text-label">{t("characters.photos")}</p>
          <ul class="grid grid-cols-4 gap-2" aria-label={t("characters.photos")}>
            <For each={photos()}>
              {(photo, index) => (
                <li class="rim relative aspect-square overflow-hidden rounded-[12px] bg-fill animate-fade-in">
                  <img src={photo.url} alt={t("characters.photo", { n: index() + 1 })} class="size-full object-cover" />
                  <span class="absolute top-0.5 right-0.5">
                    <IconButton
                      label={t("characters.removePhoto")}
                      variant="overlay"
                      size="xs"
                      circle
                      tooltip={false}
                      icon={<IconClose class="size-3.5" weight={2.25} />}
                      onClick={() => setPhotos(photos().filter((item) => item.id !== photo.id))}
                    />
                  </span>
                </li>
              )}
            </For>
            <Show when={uploads.uploading()}>
              <li class="flex aspect-square items-center justify-center rounded-[12px] bg-fill text-label-2">
                <Spinner class="size-5" label={t("images.uploading")} />
              </li>
            </Show>
            <Show when={photos().length < MAX_PHOTOS && !uploads.uploading()}>
              <li>
                <button
                  type="button"
                  class="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-[12px] border border-dashed border-separator text-caption text-label-2 transition-[background-color,color] duration-(--motion-micro) hover:bg-fill hover:text-label"
                  onClick={() => fileInput?.click()}
                >
                  <IconPlus class="size-5" />
                  {t("characters.addPhoto")}
                </button>
              </li>
            </Show>
          </ul>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            class="hidden"
            onChange={(event) => {
              const files = event.currentTarget.files
              if (files) void uploads.upload(files)
              event.currentTarget.value = ""
            }}
          />
          <p class="text-footnote text-label-2">{t("characters.tip")}</p>
        </div>
        <p class="rounded-[12px] bg-fill px-3 py-2 text-footnote text-label-2">{t("characters.rights")}</p>
      </form>
    </Dialog>
  )
}
