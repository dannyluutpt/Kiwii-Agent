import { useNavigate } from "@solidjs/router"
import { createSignal, For, Show } from "solid-js"
import { createStore } from "solid-js/store"
import { IconImage, IconVideo } from "@/components/icons"
import { Page } from "@/components/page"
import { useLanguage } from "@/context/language"
import { CATEGORIES, fillTemplate, MOVES, STYLES, TEMPLATES, templateReady, type Template } from "@/templates"
import { Button } from "@/ui/button"
import { Dialog } from "@/ui/dialog"
import { Tag } from "@/ui/tag"
import { TextField } from "@/ui/text-field"

// Ready-made starting points by what the person wants to make. Picking one asks for a few words, then
// opens the studio with the prompt written, the model and the frame set; nothing runs until they press
// Generate there, so they see the price first and can attach their photo.
export default function Templates() {
  const { t, locale } = useLanguage()
  const navigate = useNavigate()
  const [open, setOpen] = createSignal<Template>()
  const [values, setValues] = createStore<Record<string, string>>({})
  const [look, setLook] = createSignal("none")

  const pick = (template: Template) => {
    setValues(Object.fromEntries(Object.keys(values).map((key) => [key, ""])))
    setLook("none")
    setOpen(template)
  }
  const looks = () => (open()?.kind === "video" ? MOVES : STYLES)
  const apply = () => {
    const template = open()
    if (!template || !templateReady(template, values)) return
    const extra = looks().find((item) => item.id === look())?.prompt
    const query = new URLSearchParams({ prompt: fillTemplate(template, values, extra), ratio: template.aspectRatio })
    if (template.kind === "video") query.set("kind", "video")
    if (template.model) query.set("model", template.model)
    navigate(`/?${query}`)
  }

  return (
    <Page title={t("templates.title")} subtitle={t("templates.lead")} width="wide">
      <div class="flex flex-col gap-10">
        <For each={CATEGORIES}>
          {(category) => (
            <section aria-labelledby={`templates-${category.id}`}>
              <h2 id={`templates-${category.id}`} class="mb-3 text-title-3 text-label">
                {category.title[locale()]}
              </h2>
              <ul class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <For each={TEMPLATES.filter((template) => template.category === category.id)}>
                  {(template) => (
                    <li>
                      <button
                        type="button"
                        class="flex h-full w-full items-start gap-3 rounded-card bg-surface bg-sheen p-4 text-left shadow-raised transition-[background-color,box-shadow,translate,scale] duration-(--motion-standard) ease-standard hover:-translate-y-0.5 hover:bg-surface-2 hover:shadow-lift active:scale-[0.99]"
                        onClick={() => pick(template)}
                      >
                        <span class="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-accent-soft bg-amber-soft-gloss text-accent shadow-tinted">
                          <Show when={template.kind === "video"} fallback={<IconImage class="size-5" />}>
                            <IconVideo class="size-5" />
                          </Show>
                        </span>
                        <span class="flex min-w-0 flex-col gap-1">
                          <span class="text-headline text-label">{template.title[locale()]}</span>
                          <span class="text-footnote text-label-2">{template.lead[locale()]}</span>
                          <span class="mt-1 flex flex-wrap gap-1.5">
                            <Tag>{template.aspectRatio}</Tag>
                            <Show when={template.needsPhoto}>
                              <Tag tone="accent">{t("templates.photo")}</Tag>
                            </Show>
                          </span>
                        </span>
                      </button>
                    </li>
                  )}
                </For>
              </ul>
            </section>
          )}
        </For>
      </div>
      <Dialog
        open={!!open()}
        onOpenChange={(next) => !next && setOpen(undefined)}
        title={open()?.title[locale()] ?? ""}
        description={open()?.lead[locale()]}
        actions={
          <>
            <Button variant="secondary" onClick={() => setOpen(undefined)}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" disabled={!open() || !templateReady(open()!, values)} onClick={apply}>
              {t("templates.use")}
            </Button>
          </>
        }
      >
        <form
          class="mt-4 flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            apply()
          }}
        >
          <For each={open()?.slots}>
            {(slot) => (
              <TextField
                label={slot.optional ? `${slot.label[locale()]} (${t("templates.optional")})` : slot.label[locale()]}
                placeholder={slot.placeholder[locale()]}
                value={values[slot.id] ?? ""}
                onChange={(value) => setValues(slot.id, value)}
                maxLength={200}
              />
            )}
          </For>
          <fieldset class="flex flex-col gap-2">
            <legend class="mb-1.5 text-subhead text-label-2">
              {open()?.kind === "video" ? t("templates.move") : t("templates.style")}
            </legend>
            <div class="flex flex-wrap gap-1.5">
              <For each={looks()}>
                {(item) => (
                  <button
                    type="button"
                    aria-pressed={look() === item.id}
                    class="h-9 rounded-full px-3.5 text-subhead transition-colors duration-(--motion-micro) pointer-coarse:h-11"
                    classList={{
                      "bg-accent font-semibold text-on-accent": look() === item.id,
                      "bg-fill text-label hover:bg-fill-2": look() !== item.id,
                    }}
                    onClick={() => setLook(item.id)}
                  >
                    {item.title[locale()]}
                  </button>
                )}
              </For>
            </div>
          </fieldset>
          <Show when={open()?.needsPhoto}>
            {(note) => (
              <p class="rounded-control bg-accent-soft px-3 py-2 text-footnote text-label">{note()[locale()]}</p>
            )}
          </Show>
        </form>
      </Dialog>
    </Page>
  )
}
