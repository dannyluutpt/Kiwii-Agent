import { A } from "@solidjs/router"
import { createSignal, Show, type JSX } from "solid-js"
import { useCharacters } from "@/context/characters"
import { useLanguage } from "@/context/language"
import { useStudio } from "@/context/studio"
import type { ImageModel, ModelsResponse } from "@/images"
import { Button, buttonClass } from "@/ui/button"
import { IconButton } from "@/ui/icon-button"
import { Popover, PopoverContent } from "@/ui/popover"
import { AspectIcon } from "./aspect-icon"
import { CastStrip, CharacterOptions } from "./characters"
import { IconArrowUp, IconChevronDown, IconImage, IconPerson } from "./icons"
import { createReferenceUploads, ReferenceStrip } from "./references"
import { AspectOptions, CountOptions, ModelOptions, QualityOptions } from "./studio-options"

const CHIP =
  "flex h-8 min-w-0 max-w-40 items-center gap-1 rounded-full bg-fill bg-gloss px-2.5 text-footnote font-medium text-label shadow-gloss transition-[background-color,box-shadow,color] duration-(--motion-micro) hover:bg-gloss-hover disabled:opacity-50 data-[expanded]:text-accent data-[expanded]:shadow-selected"

// Where the person talks to the assistant: the words, the pictures to work from, and the settings
// every run of the reply uses, each in its own popover. The send button shows the cheapest a reply
// can cost.
export function AssistantComposer(props: {
  config: ModelsResponse
  busy: boolean
  locked: boolean
  onSend: () => void
}) {
  const { t } = useLanguage()
  const studio = useStudio()
  const characters = useCharacters()
  const cast = () => characters.picked().flatMap((id) => characters.find(id) ?? [])
  let fileInput: HTMLInputElement | undefined
  const model = () => props.config.models.find((m) => m.id === studio.settings.model)
  const maxReferences = () => model()?.maxReferences ?? props.config.maxReferences
  const uploads = createReferenceUploads({
    references: studio.references,
    onReferences: studio.setReferences,
    maxCount: maxReferences,
    maxEdge: () => model()?.maxReferenceEdge ?? 2048,
  })

  const pick = (next: ImageModel) => {
    const option = next.options.some((o) => o.id === studio.settings.option)
      ? studio.settings.option
      : (next.options[0]?.id ?? "")
    const aspectRatio = next.aspectRatios.includes(studio.settings.aspectRatio) ? studio.settings.aspectRatio : "1:1"
    studio.patch({ model: next.id, option, aspectRatio })
    if (studio.references().length > next.maxReferences)
      studio.setReferences(studio.references().slice(0, next.maxReferences))
    void uploads.refit(next.maxReferenceEdge)
  }

  const canSend = () =>
    !props.busy &&
    !props.locked &&
    !uploads.uploading() &&
    studio.prompt().trim().length > 0 &&
    studio.cost() !== undefined
  const send = () => canSend() && props.onSend()

  return (
    <form
      class="mx-3 mb-3 flex shrink-0 flex-col rounded-[20px] bg-surface-2 bg-sheen shadow-raised transition-shadow duration-(--motion-standard) focus-within:shadow-[var(--k-shadow-raised),var(--k-shadow-focus)]"
      aria-label={t("assistant.composer")}
      onSubmit={(event) => {
        event.preventDefault()
        send()
      }}
    >
      <ReferenceStrip
        class="px-3 pt-3"
        references={studio.references()}
        uploading={uploads.uploading()}
        onRemove={(ref) => studio.setReferences(studio.references().filter((r) => r.id !== ref.id))}
      />
      <CastStrip class="px-3 pt-3" />
      <textarea
        data-studio-prompt
        class="max-h-48 min-h-16 w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-callout text-label outline-none placeholder:text-label-3 disabled:cursor-not-allowed [field-sizing:content]"
        aria-label={t("images.placeholder")}
        aria-description={t("assistant.enterHint")}
        enterkeyhint="send"
        rows={2}
        placeholder={t("images.placeholder")}
        value={studio.prompt()}
        disabled={props.locked}
        onInput={(event) => studio.setPrompt(event.currentTarget.value)}
        onPaste={(event) => {
          const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"))
          if (files.length === 0) return
          event.preventDefault()
          void uploads.upload(files)
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault()
            send()
          }
        }}
      />
      <div class="flex flex-wrap items-center gap-1 p-1.5">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          class="hidden"
          onChange={(event) => event.currentTarget.files && void uploads.upload(event.currentTarget.files)}
        />
        <IconButton
          label={t(model()?.referenceSurcharge ? "images.references.addHint" : "images.references.addHintFree", {
            n: maxReferences(),
            extra: model()?.referenceSurcharge ?? 0,
          })}
          size="md"
          icon={<IconImage class="size-5" />}
          disabled={props.locked || uploads.uploading() || studio.references().length >= maxReferences()}
          onClick={() => fileInput?.click()}
        />
        <Option
          label={t("characters.picker")}
          value={
            cast().length
              ? cast()
                  .map((c) => c.name)
                  .join(", ")
              : t("characters.picker")
          }
          icon={<IconPerson class="size-4 shrink-0" />}
          disabled={props.locked}
        >
          {(close) => <CharacterOptions max={props.config.maxCharacters} onCreate={close} />}
        </Option>
        <Show when={model()}>
          {(m) => {
            const shared = () => ({
              config: props.config,
              model: m(),
              settings: studio.settings,
            })
            const option = () => m().options.find((o) => o.id === studio.settings.option)?.label ?? ""
            return (
              <>
                <Option label={t("images.model")} value={m().name} disabled={props.locked}>
                  {(close) => (
                    <ModelOptions
                      {...shared()}
                      onSettings={studio.patch}
                      onPickModel={(next) => {
                        pick(next)
                        close()
                      }}
                    />
                  )}
                </Option>
                <Option
                  label={m().param === "resolution" ? t("images.resolution") : t("images.quality")}
                  value={option()}
                  disabled={props.locked}
                >
                  {(close) => (
                    <QualityOptions
                      {...shared()}
                      onSettings={(patch) => {
                        studio.patch(patch)
                        close()
                      }}
                    />
                  )}
                </Option>
                <Option
                  label={t("images.aspect")}
                  value={studio.settings.aspectRatio}
                  icon={<AspectIcon ratio={studio.settings.aspectRatio} class="size-4 shrink-0" />}
                  disabled={props.locked}
                >
                  {(close) => (
                    <AspectOptions
                      {...shared()}
                      onSettings={(patch) => {
                        studio.patch(patch)
                        close()
                      }}
                    />
                  )}
                </Option>
                <Option
                  label={t("images.count")}
                  value={t("images.countShort", { n: studio.settings.n })}
                  disabled={props.locked}
                >
                  {(close) => (
                    <CountOptions
                      {...shared()}
                      onSettings={(patch) => {
                        studio.patch(patch)
                        close()
                      }}
                    />
                  )}
                </Option>
              </>
            )
          }}
        </Show>
        <span class="flex-1" />
        <Show
          when={!props.locked}
          fallback={
            <A href="/pricing" class={buttonClass("primary", "md")}>
              {t("images.locked.cta")}
            </A>
          }
        >
          <Button
            type="submit"
            variant="primary"
            pill
            disabled={!canSend()}
            loading={props.busy}
            leading={<IconArrowUp class="size-[18px]" weight={2.25} />}
            aria-label={t("assistant.sendFor", { n: studio.cost() ?? 0 })}
          >
            {t("assistant.from", { n: studio.cost() ?? "–" })}
          </Button>
        </Show>
      </div>
    </form>
  )
}

// A setting of the composer: a chip showing its value that opens its choices; picking one closes it.
function Option(props: {
  label: string
  value: string
  icon?: JSX.Element
  disabled?: boolean
  children: (close: () => void) => JSX.Element
}) {
  const { t } = useLanguage()
  const [open, setOpen] = createSignal(false)
  return (
    <Popover open={open()} onOpenChange={setOpen} placement="top-start" gutter={8}>
      <Popover.Trigger
        class={CHIP}
        disabled={props.disabled}
        aria-label={t("assistant.option", { label: props.label, value: props.value })}
      >
        {props.icon}
        <span class="truncate">{props.value}</span>
        <IconChevronDown class="size-3.5 shrink-0 text-label-3" />
      </Popover.Trigger>
      <PopoverContent label={props.label}>{props.children(() => setOpen(false))}</PopoverContent>
    </Popover>
  )
}
