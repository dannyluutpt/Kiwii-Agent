import { For, Show } from "solid-js"
import { useCharacters } from "@/context/characters"
import { useLanguage } from "@/context/language"
import type { Character } from "@/images"
import { Button } from "@/ui/button"
import { IconButton, iconButtonClass } from "@/ui/icon-button"
import { Menu, MenuContent, MenuItem, MenuSeparator } from "@/ui/menu"
import { Skeleton } from "@/ui/skeleton"
import { IconCheck, IconClose, IconEllipsis, IconPencil, IconPersonAdd, IconPlus, IconTrash } from "./icons"

// A character's face: its first photo, in a circle.
export function CharacterFace(props: { character: Pick<Character, "images">; class?: string }) {
  return (
    <img
      src={props.character.images[0]?.url}
      alt=""
      class={`shrink-0 rounded-full bg-fill object-cover ${props.class ?? "size-6"}`}
    />
  )
}

// The characters picked for the next pictures, as chips the person can take off.
export function CastStrip(props: { class?: string }) {
  const { t } = useLanguage()
  const characters = useCharacters()
  const cast = () => characters.picked().flatMap((id) => characters.find(id) ?? [])
  return (
    <Show when={cast().length > 0}>
      <ul class={`flex flex-wrap gap-1.5 ${props.class ?? ""}`} aria-label={t("characters.inUse")}>
        <For each={cast()}>
          {(character) => (
            <li class="flex h-8 items-center gap-1.5 rounded-full bg-accent-soft bg-amber-soft-gloss pr-0.5 pl-1 text-footnote font-medium text-label shadow-tinted animate-fade-in">
              <CharacterFace character={character} />
              <span class="max-w-28 truncate">{character.name}</span>
              <IconButton
                label={t("characters.unpick", { name: character.name })}
                size="xs"
                circle
                tooltip={false}
                icon={<IconClose class="size-3.5" weight={2.25} />}
                onClick={() => characters.unpick(character.id)}
              />
            </li>
          )}
        </For>
      </ul>
    </Show>
  )
}

// Every saved character as a row to pick or take off, then a row that saves a new one: the
// composer's popover and the phone's options sheet. `onCreate` closes whatever holds the list.
export function CharacterOptions(props: { max: number; onCreate?: () => void }) {
  const { t } = useLanguage()
  const characters = useCharacters()
  const row =
    "flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left transition-[background-color] duration-(--motion-micro) hover:bg-fill-2 active:bg-fill-2"
  return (
    <div class="flex flex-col gap-2">
      <p class="text-footnote font-semibold text-label-2">{t("characters.picker")}</p>
      <div class="divide-y divide-separator overflow-hidden rounded-[14px] bg-fill bg-sheen shadow-gloss">
        <For each={characters.list.latest ?? []}>
          {(character) => {
            const on = () => characters.picked().includes(character.id)
            return (
              <button
                type="button"
                class={row}
                aria-pressed={on()}
                onClick={() => characters.pick(character.id, props.max)}
              >
                <CharacterFace character={character} class="size-8" />
                <span class="min-w-0 flex-1 truncate text-callout font-medium text-label">{character.name}</span>
                <Show when={on()}>
                  <IconCheck class="size-5 text-accent drop-shadow-[0_0_6px_rgb(255_214_10/0.7)]" weight={2.25} />
                </Show>
              </button>
            )
          }}
        </For>
        <button
          type="button"
          class={`${row} text-callout font-medium text-accent`}
          onClick={() => {
            props.onCreate?.()
            characters.compose()
          }}
        >
          <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft shadow-tinted">
            <IconPlus class="size-4" weight={2.25} />
          </span>
          {t("characters.create")}
        </button>
      </div>
      <p class="text-footnote text-label-2">{t("characters.pickerHint")}</p>
    </div>
  )
}

// What the "Characters" filter shows: a card that saves a new character, then every saved one with
// its face, to use in the next pictures, rename or delete.
export function CharacterGallery(props: { max: number }) {
  const { t } = useLanguage()
  const characters = useCharacters()
  return (
    <div class="flex min-h-full w-full flex-col gap-4 px-3 py-3 md:px-5 md:py-5">
      <p class="max-w-xl text-callout text-label-2">{t("characters.lead")}</p>
      <ul class="grid grid-cols-2 gap-2 md:gap-3 lg:grid-cols-3 2xl:grid-cols-4" aria-label={t("characters.title")}>
        <li>
          <button
            type="button"
            class="flex aspect-[3/4] w-full flex-col items-center justify-center gap-2.5 rounded-[14px] border border-dashed border-accent/40 bg-accent-soft/40 text-accent transition-[background-color,translate,scale] duration-(--motion-standard) ease-standard hover:-translate-y-0.5 hover:bg-accent-soft active:scale-[0.99]"
            onClick={() => characters.compose()}
          >
            <span class="flex size-12 items-center justify-center rounded-full bg-accent-soft bg-amber-soft-gloss shadow-tinted">
              <IconPersonAdd class="size-6" />
            </span>
            <span class="text-subhead font-semibold">{t("characters.create")}</span>
          </button>
        </li>
        <Show when={characters.list.loading && !characters.list.latest}>
          <For each={[1, 2, 3]}>
            {() => (
              <li aria-hidden="true">
                <Skeleton class="aspect-[3/4] w-full rounded-[14px]" />
              </li>
            )}
          </For>
        </Show>
        <For each={characters.list.latest ?? []}>
          {(character) => <CharacterCard character={character} max={props.max} />}
        </For>
      </ul>
    </div>
  )
}

function CharacterCard(props: { character: Character; max: number }) {
  const { t } = useLanguage()
  const characters = useCharacters()
  const on = () => characters.picked().includes(props.character.id)
  return (
    <li
      class="rim relative flex flex-col overflow-hidden rounded-[14px] bg-surface bg-sheen shadow-raised transition-shadow duration-(--motion-standard) animate-fade-in"
      classList={{ "shadow-selected": on() }}
    >
      <img
        src={props.character.images[0]?.url}
        alt={props.character.name}
        loading="lazy"
        decoding="async"
        class="aspect-[3/4] w-full bg-fill object-cover"
      />
      <div class="flex items-center gap-1 py-1.5 pr-1 pl-3">
        <div class="flex min-w-0 flex-1 flex-col">
          <p class="truncate text-subhead font-semibold text-label">{props.character.name}</p>
          <p class="text-caption text-label-2">{t("characters.photoCount", { n: props.character.images.length })}</p>
        </div>
        <Button
          size="sm"
          pill
          variant={on() ? "tinted" : "secondary"}
          aria-pressed={on()}
          onClick={() => characters.pick(props.character.id, props.max)}
        >
          {on() ? t("characters.inUse") : t("characters.use")}
        </Button>
        <Menu placement="bottom-end" gutter={4}>
          <Menu.Trigger aria-label={t("characters.actions")} class={iconButtonClass("ghost", "sm")}>
            <IconEllipsis class="size-4" />
          </Menu.Trigger>
          <MenuContent>
            <MenuItem
              icon={<IconPencil class="size-[18px]" />}
              onSelect={() => void characters.rename(props.character)}
            >
              {t("projects.rename")}
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon={<IconTrash class="size-[18px]" />}
              destructive
              onSelect={() => void characters.remove(props.character)}
            >
              {t("common.delete")}
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
    </li>
  )
}
