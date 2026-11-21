import { createEffect, createSignal, For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import type { SavedStore } from "@/context/saved"
import type { Reference } from "@/images"
import { Button } from "@/ui/button"
import { Dialog } from "@/ui/dialog"
import { IconButton } from "@/ui/icon-button"
import { Spinner } from "@/ui/spinner"
import { TextField } from "@/ui/text-field"
import { toast } from "@/ui/toast"
import { FaceCrop } from "./face-crop"
import { IconClose, IconPlus } from "./icons"
import { createReferenceUploads } from "./references"

const MAX_PHOTOS = 4
// Plenty for a face to be recognised or a place to be told; a larger photo only costs more to read
// on every run.
const PHOTO_EDGE = 2048

// Saves a character or a location from one to four photos: uploads, or pictures the account made,
// which the gallery and the viewer open it with. The server keeps its own copies of them.
export function SavedDialog(props: { store: SavedStore; max: number }) {
  const { t } = useLanguage()
  const kind = props.store.kind
  const [name, setName] = createSignal("")
  const [photos, setPhotos] = createSignal<Reference[]>([])
  const [saving, setSaving] = createSignal(false)
  // The photo a close-up of the face is being cut from, if any.
  const [cropping, setCropping] = createSignal<Reference>()
  let fileInput: HTMLInputElement | undefined
  const uploads = createReferenceUploads({
    references: photos,
    onReferences: setPhotos,
    maxCount: () => MAX_PHOTOS,
    maxEdge: () => PHOTO_EDGE,
  })

  // Each opening starts from the photos it was opened with.
  createEffect(() => {
    const draft = props.store.draft()
    if (!draft) return
    setName("")
    setPhotos(draft.slice(0, MAX_PHOTOS))
    setCropping(undefined)
  })

  // The close-up goes first, where a character's face is read from. With four photos already, it
  // takes the place of the one it was cut from.
  const addFace = async (file: File, from: Reference) => {
    setCropping(undefined)
    const before = photos().length < MAX_PHOTOS ? photos() : photos().filter((photo) => photo.id !== from.id)
    setPhotos(before)
    await uploads.upload([file])
    const face = photos().find((photo) => !before.some((old) => old.id === photo.id))
    if (face) setPhotos([face, ...photos().filter((photo) => photo.id !== face.id)])
    else setPhotos(photos().some((photo) => photo.id === from.id) ? photos() : [...photos(), from])
  }

  const canSave = () =>
    name().trim().length > 0 && photos().length > 0 && !uploads.uploading() && !saving() && !cropping()
  const save = async () => {
    if (!canSave()) return
    setSaving(true)
    const made = await props.store.create(
      name().trim(),
      photos().map((photo) => photo.id),
    )
    setSaving(false)
    if (!made) return
    props.store.closeDraft()
    toast.success(t(`${kind}.saved`, { name: made.name }), {
      action: { label: t(`${kind}.use`), onClick: () => props.store.pick(made.id, props.max) },
    })
  }

  return (
    <Dialog
      open={props.store.draft() !== undefined}
      onOpenChange={(open) => !open && props.store.closeDraft()}
      title={t(`${kind}.create`)}
      description={t(`${kind}.lead`)}
      actions={
        <>
          <Button variant="secondary" onClick={() => props.store.closeDraft()}>
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
          label={t(`${kind}.name`)}
          placeholder={t(`${kind}.namePlaceholder`)}
          value={name()}
          onChange={setName}
          maxLength={40}
          autocapitalize="words"
        />
        <div class="flex flex-col gap-1.5">
          <p class="text-subhead font-medium text-label">{t(`${kind}.photos`)}</p>
          <Show when={cropping()}>
            {(photo) => (
              <FaceCrop
                photo={photo()}
                onDone={(file) => void addFace(file, photo())}
                onCancel={() => setCropping(undefined)}
              />
            )}
          </Show>
          <ul class={`grid grid-cols-4 gap-2 ${cropping() ? "hidden" : ""}`} aria-label={t(`${kind}.photos`)}>
            <For each={photos()}>
              {(photo, index) => (
                <li class="rim relative aspect-square overflow-hidden rounded-[12px] bg-fill animate-fade-in">
                  <img src={photo.url} alt={t(`${kind}.photo`, { n: index() + 1 })} class="size-full object-cover" />
                  <span class="absolute top-0.5 right-0.5">
                    <IconButton
                      label={t(`${kind}.removePhoto`)}
                      variant="overlay"
                      size="xs"
                      circle
                      tooltip={false}
                      icon={<IconClose class="size-3.5" weight={2.25} />}
                      onClick={() => setPhotos(photos().filter((item) => item.id !== photo.id))}
                    />
                  </span>
                  <Show when={kind === "characters" && !uploads.uploading()}>
                    <button
                      type="button"
                      class="absolute inset-x-0 bottom-0 bg-black/60 py-1 text-caption font-medium text-white backdrop-blur-sm transition-colors duration-(--motion-micro) hover:bg-black/75"
                      aria-label={t("characters.crop.open", { n: index() + 1 })}
                      onClick={() => setCropping(photo)}
                    >
                      {t("characters.crop.short")}
                    </button>
                  </Show>
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
                  {t(`${kind}.addPhoto`)}
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
          <Show when={!cropping()}>
            <p class="text-footnote text-label-2">{t(`${kind}.tip`)}</p>
          </Show>
        </div>
        <p class="rounded-[12px] bg-fill px-3 py-2 text-footnote text-label-2">{t(`${kind}.rights`)}</p>
      </form>
    </Dialog>
  )
}
