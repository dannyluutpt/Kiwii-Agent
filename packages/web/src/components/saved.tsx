import { For, Show } from "solid-js"
import { useCharacters } from "@/context/characters"
import { useLanguage } from "@/context/language"
import { useLocations } from "@/context/locations"
import type { SavedKind, SavedStore } from "@/context/saved"
import type { Saved } from "@/images"
import { Button } from "@/ui/button"
import { IconButton, iconButtonClass } from "@/ui/icon-button"
import { Menu, MenuContent, MenuItem, MenuSeparator } from "@/ui/menu"
import { Skeleton } from "@/ui/skeleton"
import {
  IconCheck,
  IconClose,
  IconEllipsis,
  IconPencil,
  IconPersonAdd,
  IconPlaceAdd,
  IconPlus,
  IconTrash,
} from "./icons"

// What one saved is shown by: its first photo, a character's face in a circle, a place in a rounded
// square.
export function SavedThumb(props: { saved: Pick<Saved, "images">; kind: SavedKind; class?: string }) {
  return (
    <img
      src={props.saved.images[0]?.url}
      alt=""
      class={`shrink-0 bg-fill object-cover ${props.kind === "locations" ? "rounded-[6px]" : "rounded-full"} ${props.class ?? "size-6"}`}
    />
  )
}

// The characters and the location picked for the next pictures, as chips the person can take off.
export function PickedStrip(props: { class?: string }) {
  const { t } = useLanguage()
  const stores = [useCharacters(), useLocations()]
  const picked = () =>
    stores.flatMap((store) =>
      store.picked().flatMap((id) => {
        const item = store.find(id)
        return item ? [{ store, item }] : []
      }),
    )
  return (
    <Show when={picked().length > 0}>
      <ul class={`flex flex-wrap gap-1.5 ${props.class ?? ""}`} aria-label={t("characters.inUse")}>
        <For each={picked()}>
          {(entry) => (
            <li class="flex h-8 items-center gap-1.5 rounded-full bg-accent-soft bg-amber-soft-gloss pr-0.5 pl-1 text-footnote font-medium text-label shadow-tinted animate-fade-in">
              <SavedThumb saved={entry.item} kind={entry.store.kind} />
              <span class="max-w-28 truncate">{entry.item.name}</span>
              <IconButton
                label={t("characters.unpick", { name: entry.item.name })}
                size="xs"
                circle
                tooltip={false}
                icon={<IconClose class="size-3.5" weight={2.25} />}
                onClick={() => entry.store.unpick(entry.item.id)}
              />
            </li>
          )}
        </For>
      </ul>
    </Show>
  )
}

// Every saved character or location as a row to pick or take off, then a row that saves a new one:
// the composer's popover and the phone's options sheet. `onCreate` closes whatever holds the list.
export function SavedOptions(props: { store: SavedStore; max: number; onCreate?: () => void; disabled?: boolean }) {
  const { t } = useLanguage()
  const row =
    "flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-left transition-[background-color] duration-(--motion-micro) hover:bg-fill-2 active:bg-fill-2"
  return (
    <div class="flex flex-col gap-2">
      <p class="text-footnote font-semibold text-label-2">{t(`${props.store.kind}.picker`)}</p>
      <div class="divide-y divide-separator overflow-hidden rounded-[14px] bg-fill bg-sheen shadow-gloss">
        <For each={props.store.list.latest ?? []}>
          {(item) => {
            const on = () => props.store.picked().includes(item.id)
            return (
              <button
                type="button"
                class={`${row} disabled:opacity-50`}
                aria-pressed={on()}
                disabled={props.disabled}
                onClick={() => props.store.pick(item.id, props.max)}
              >
                <SavedThumb saved={item} kind={props.store.kind} class="size-8" />
                <span class="min-w-0 flex-1 truncate text-callout font-medium text-label">{item.name}</span>
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
            props.store.compose()
          }}
        >
          <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft shadow-tinted">
            <IconPlus class="size-4" weight={2.25} />
          </span>
          {t(`${props.store.kind}.create`)}
        </button>
      </div>
      <p class="text-footnote text-label-2">{t(`${props.store.kind}.pickerHint`)}</p>
    </div>
  )
}

// What the "Characters" and "Locations" filters show: a card that saves a new one, then every saved
// one, to use in the next pictures, rename or delete. A character's card stands like a portrait, a
// location's lies like a view. On a page of its own, `onUse` goes on to the studio once one is picked,
// and the page gives the padding.
export function SavedGallery(props: { store: SavedStore; max: number; onUse?: () => void; class?: string }) {
  const { t } = useLanguage()
  const shape = () => (props.store.kind === "locations" ? "aspect-[4/3]" : "aspect-[3/4]")
  return (
    <div class={`flex min-h-full w-full flex-col gap-4 ${props.class ?? "px-3 py-3 md:px-5 md:py-5"}`}>
      <p class="max-w-xl text-callout text-label-2">{t(`${props.store.kind}.lead`)}</p>
      <ul
        class="grid grid-cols-2 gap-2 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-3"
        aria-label={t(`${props.store.kind}.title`)}
      >
        <li>
          <button
            type="button"
            class={`flex ${shape()} w-full flex-col items-center justify-center gap-2.5 rounded-[14px] border border-dashed border-accent/40 bg-accent-soft/40 text-accent transition-[background-color,translate,scale] duration-(--motion-standard) ease-standard hover:-translate-y-0.5 hover:bg-accent-soft active:scale-[0.99]`}
            onClick={() => props.store.compose()}
          >
            <span class="flex size-12 items-center justify-center rounded-full bg-accent-soft bg-amber-soft-gloss shadow-tinted">
              <Show when={props.store.kind === "locations"} fallback={<IconPersonAdd class="size-6" />}>
                <IconPlaceAdd class="size-6" />
              </Show>
            </span>
            <span class="text-subhead font-semibold">{t(`${props.store.kind}.create`)}</span>
          </button>
        </li>
        <Show when={props.store.list.loading && !props.store.list.latest}>
          <For each={[1, 2, 3]}>
            {() => (
              <li aria-hidden="true">
                <Skeleton class={`${shape()} w-full rounded-[14px]`} />
              </li>
            )}
          </For>
        </Show>
        <For each={props.store.list.latest ?? []}>
          {(item) => <SavedCard store={props.store} item={item} max={props.max} shape={shape()} onUse={props.onUse} />}
        </For>
      </ul>
    </div>
  )
}

function SavedCard(props: { store: SavedStore; item: Saved; max: number; shape: string; onUse?: () => void }) {
  const { t } = useLanguage()
  const on = () => props.store.picked().includes(props.item.id)
  return (
    <li
      class="rim relative flex flex-col overflow-hidden rounded-[14px] bg-surface bg-sheen shadow-raised transition-shadow duration-(--motion-standard) animate-fade-in"
      classList={{ "shadow-selected": on() }}
    >
      <img
        src={props.item.images[0]?.url}
        alt={props.item.name}
        loading="lazy"
        decoding="async"
        class={`${props.shape} w-full bg-fill object-cover`}
      />
      {/* The name has a line of its own: a place's name is often longer than a narrow card leaves. */}
      <div class="flex flex-col gap-0.5 py-1.5 pr-1 pl-3">
        <p class="truncate pr-2 text-subhead font-semibold text-label">{props.item.name}</p>
        <div class="flex items-center gap-1">
          <p class="min-w-0 flex-1 truncate text-caption text-label-2">
            {t(`${props.store.kind}.photoCount`, { n: props.item.images.length })}
          </p>
          <Button
            size="sm"
            pill
            variant={on() ? "tinted" : "secondary"}
            aria-pressed={on()}
            onClick={() => {
              const use = props.onUse
              if (!use) return props.store.pick(props.item.id, props.max)
              if (!on()) props.store.pick(props.item.id, props.max)
              use()
            }}
          >
            {on() ? t(`${props.store.kind}.inUse`) : t(`${props.store.kind}.use`)}
          </Button>
          <Menu placement="bottom-end" gutter={4}>
            <Menu.Trigger aria-label={t(`${props.store.kind}.actions`)} class={iconButtonClass("ghost", "sm")}>
              <IconEllipsis class="size-4" />
            </Menu.Trigger>
            <MenuContent>
              <MenuItem icon={<IconPencil class="size-[18px]" />} onSelect={() => void props.store.rename(props.item)}>
                {t("projects.rename")}
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                icon={<IconTrash class="size-[18px]" />}
                destructive
                onSelect={() => void props.store.remove(props.item)}
              >
                {t("common.delete")}
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </div>
    </li>
  )
}
