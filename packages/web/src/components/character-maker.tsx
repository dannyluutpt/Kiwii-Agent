import { A } from "@solidjs/router"
import { createSignal, For, Show } from "solid-js"
import { createStore, produce } from "solid-js/store"
import { api, ApiError, apiStream } from "@/api"
import { useAuth } from "@/context/auth"
import { useCharacters } from "@/context/characters"
import { useLanguage } from "@/context/language"
import { useStudio } from "@/context/studio"
import type { Generation } from "@/images"
import { errorMessage } from "@/lib/errors"
import { Button, buttonClass } from "@/ui/button"
import { IconButton } from "@/ui/icon-button"
import { Segmented } from "@/ui/segmented"
import { Spinner } from "@/ui/spinner"
import { TextField, textareaClass } from "@/ui/text-field"
import { toast } from "@/ui/toast"
import { IconClose, IconSparkles } from "./icons"

type Style = "photo" | "3d" | "anime"
const STYLES: Style[] = ["photo", "3d", "anime"]

// A sheet made on this page, with the name, description and style it was made from: saving it and
// making another use them.
type Draft = {
  key: string
  id?: string
  status: "running" | "done" | "failed"
  name: string
  description: string
  style: Style
  fileID?: string
  error?: string
  saving?: boolean
}

// Creates a character from a description: one sheet with the face and four full-body views, which
// saving cuts into the character's photos. Each sheet waits here as a draft until it is saved or
// dismissed, and stays in the Library either way.
export function CharacterMaker(props: { max: number; onUse: () => void }) {
  const { t } = useLanguage()
  const auth = useAuth()
  const studio = useStudio()
  const characters = useCharacters()
  const [name, setName] = createSignal("")
  const [description, setDescription] = createSignal("")
  const [style, setStyle] = createSignal<Style>("photo")
  const [drafts, setDrafts] = createStore<Draft[]>([])
  const price = () => studio.config.latest?.sheets.character
  const change = (key: string, edit: (draft: Draft) => void) => setDrafts((draft) => draft.key === key, produce(edit))
  const drop = (key: string) => setDrafts((list) => list.filter((draft) => draft.key !== key))

  const make = async (input: { name: string; description: string; style: Style }) => {
    const key = `draft-${Date.now()}`
    setDrafts((list) => [{ ...input, key, status: "running" }, ...list])
    try {
      for await (const event of apiStream("/characters/sheets", {
        description: input.description,
        style: input.style,
      })) {
        const data = event.data as { id?: string; fileID?: string; message?: string }
        if (event.event === "start") change(key, (draft) => (draft.id = data.id))
        if (event.event === "image") change(key, (draft) => (draft.fileID = data.fileID))
        if (event.event === "done") change(key, (draft) => (draft.status = "done"))
        if (event.event === "error") {
          change(key, (draft) => {
            draft.status = "failed"
            draft.error = data.message
          })
        }
      }
    } catch (error) {
      const insufficient = error instanceof ApiError && error.code === "INSUFFICIENT_CREDITS"
      if (insufficient) toast.error(t("images.insufficient"))
      if (!insufficient) toast.error(errorMessage(error, t("error.network")))
      // The server never took the run: hand the description back rather than leave a failed draft.
      if (!drafts.find((draft) => draft.key === key)?.id) {
        drop(key)
        setName(input.name)
        setDescription(input.description)
        return
      }
    }
    await settle(key)
    void auth.refresh()
  }

  // A phone may drop the stream before the run ends (a quiet connection, a page in the background);
  // the server knows how it went.
  const settle = async (key: string) => {
    for (let tries = 0; tries < 60; tries++) {
      const draft = drafts.find((item) => item.key === key)
      if (!draft?.id || draft.status !== "running") return
      await new Promise((resolve) => setTimeout(resolve, 3000))
      const known = await api<Generation>(`/images/generations/${draft.id}`).catch(() => undefined)
      if (!known || known.status === "running") continue
      change(key, (item) => {
        item.status = known.status
        item.fileID = known.images[0]?.fileID
        item.error = known.error ?? undefined
      })
    }
  }

  const save = async (draft: Draft) => {
    if (!draft.fileID) return
    change(draft.key, (item) => (item.saving = true))
    const made = await characters.fromSheet(draft.name, draft.fileID)
    change(draft.key, (item) => (item.saving = false))
    if (!made) return
    drop(draft.key)
    toast.success(t("characters.saved", { name: made.name }), {
      action: {
        label: t("characters.use"),
        onClick: () => {
          characters.pick(made.id, props.max)
          props.onUse()
        },
      },
    })
  }

  const submit = () => {
    if (!name().trim() || !description().trim()) return
    void make({ name: name().trim(), description: description().trim(), style: style() })
    setName("")
    setDescription("")
  }

  return (
    <section class="mb-8 flex flex-col gap-4" aria-labelledby="character-maker">
      <div class="rim flex flex-col gap-4 rounded-card bg-surface bg-sheen p-4 shadow-raised md:p-5">
        <div class="flex items-start gap-3">
          <span class="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft bg-amber-soft-gloss text-accent shadow-tinted">
            <IconSparkles class="size-5" />
          </span>
          <div class="flex min-w-0 flex-col gap-1">
            <h2 id="character-maker" class="text-title-3 text-label">
              {t("characters.maker.title")}
            </h2>
            <p class="max-w-2xl text-callout text-label-2">{t("characters.maker.lead")}</p>
          </div>
        </div>
        <Show when={studio.config.latest}>
          <Show
            when={price()}
            fallback={
              <div class="flex flex-wrap items-center gap-3 rounded-[12px] bg-accent-soft bg-amber-soft-gloss px-4 py-3 shadow-tinted">
                <p class="min-w-0 flex-1 text-subhead text-label">{t("characters.maker.locked")}</p>
                <A href="/pricing" class={buttonClass("primary", "sm")}>
                  {t("images.locked.cta")}
                </A>
              </div>
            }
          >
            {(credits) => (
              <form
                class="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  submit()
                }}
              >
                <div class="grid gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                  <TextField
                    label={t("characters.name")}
                    placeholder={t("characters.namePlaceholder")}
                    value={name()}
                    onChange={setName}
                    maxLength={40}
                    autocapitalize="words"
                  />
                  <label class="flex flex-col gap-1.5">
                    <span class="text-subhead font-medium text-label">{t("characters.maker.description")}</span>
                    <textarea
                      class={textareaClass}
                      rows={3}
                      maxLength={1500}
                      placeholder={t("characters.maker.placeholder")}
                      value={description()}
                      onInput={(event) => setDescription(event.currentTarget.value)}
                    />
                  </label>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-3">
                  <Segmented
                    label={t("characters.maker.style")}
                    value={style()}
                    onChange={setStyle}
                    options={STYLES.map((value) => ({ value, label: t(`characters.maker.${value}`) }))}
                  />
                  <Button
                    type="submit"
                    variant="primary"
                    class="w-full sm:w-auto"
                    disabled={!name().trim() || !description().trim()}
                  >
                    {t("characters.maker.make", { n: credits() })}
                  </Button>
                </div>
              </form>
            )}
          </Show>
        </Show>
      </div>
      <Show when={drafts.length > 0}>
        <div class="flex flex-col gap-2">
          <h3 class="text-headline text-label">{t("characters.maker.drafts")}</h3>
          <ul class="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label={t("characters.maker.drafts")}>
            <For each={drafts}>
              {(draft) => (
                <li class="rim flex flex-col overflow-hidden rounded-card bg-surface bg-sheen shadow-raised animate-fade-in">
                  <div class="relative aspect-[16/9] bg-fill">
                    <Show
                      when={draft.fileID}
                      fallback={
                        <div class="flex size-full flex-col items-center justify-center gap-2 px-4 text-center text-footnote text-label-2">
                          <Show
                            when={draft.status === "running"}
                            fallback={<p class="text-danger">{draft.error ?? t("error.network")}</p>}
                          >
                            <Spinner class="size-6" />
                            {t("characters.maker.making")}
                          </Show>
                        </div>
                      }
                    >
                      {(fileID) => (
                        <img
                          src={`/api/images/files/${fileID()}`}
                          alt={t("characters.maker.sheetAlt", { name: draft.name })}
                          class="size-full object-cover"
                        />
                      )}
                    </Show>
                  </div>
                  <div class="flex flex-col gap-2 p-3">
                    <div class="flex min-h-8 items-center gap-2">
                      <p class="min-w-0 flex-1 truncate text-subhead font-semibold text-label">{draft.name}</p>
                      <Show when={draft.status !== "running"}>
                        <IconButton
                          label={t("characters.maker.dismiss")}
                          size="sm"
                          icon={<IconClose class="size-4" />}
                          disabled={draft.saving}
                          onClick={() => drop(draft.key)}
                        />
                      </Show>
                    </div>
                    <Show when={draft.status !== "running"}>
                      <div class="flex flex-wrap gap-2">
                        <Show when={draft.status === "done" && draft.fileID}>
                          <Button size="sm" variant="primary" loading={draft.saving} onClick={() => void save(draft)}>
                            {t("characters.maker.save")}
                          </Button>
                        </Show>
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={draft.saving}
                          onClick={() =>
                            void make({ name: draft.name, description: draft.description, style: draft.style })
                          }
                        >
                          {draft.status === "failed"
                            ? t("characters.maker.retry")
                            : t("characters.maker.again", { n: price() ?? 0 })}
                        </Button>
                      </div>
                    </Show>
                  </div>
                </li>
              )}
            </For>
          </ul>
          <p class="text-footnote text-label-2">{t("characters.maker.inLibrary")}</p>
        </div>
      </Show>
    </section>
  )
}
