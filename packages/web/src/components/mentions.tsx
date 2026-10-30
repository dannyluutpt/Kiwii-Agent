import { createMemo, createSignal, createUniqueId, For, Show } from "solid-js"
import { useCharacters } from "@/context/characters"
import { useLanguage } from "@/context/language"
import { useLocations } from "@/context/locations"
import { fold, mentionAt, placeMention } from "@/lib/mentions"
import { SavedThumb } from "./saved"

// The list a "@" in the prompt opens: the saved characters and locations whose names match what
// follows it. Picking one writes its name in the prompt and picks it, as the pickers would.
export function createMentions(input: {
  textarea: () => HTMLTextAreaElement | undefined
  onText: (value: string) => void
  maxCharacters: () => number
  // A clip that starts from frames takes no characters or location.
  off: () => boolean
}) {
  const { t } = useLanguage()
  const characters = useCharacters()
  const locations = useLocations()
  const id = createUniqueId()
  const [mention, setMention] = createSignal<ReturnType<typeof mentionAt>>()
  const [active, setActive] = createSignal(0)
  const options = createMemo(() => {
    const current = mention()
    if (!current || input.off()) return []
    const query = fold(current.query.trim())
    return [
      ...(characters.list.latest ?? []).map((item) => ({ item, store: characters, max: input.maxCharacters() })),
      ...(locations.list.latest ?? []).map((item) => ({ item, store: locations, max: 1 })),
    ]
      .filter((entry) => fold(entry.item.name).includes(query))
      .slice(0, 8)
  })
  const open = () => options().length > 0

  // Where the caret is decides whether a tag is being typed.
  const look = () => {
    const textarea = input.textarea()
    setMention(textarea ? mentionAt(textarea.value, textarea.selectionStart) : undefined)
    setActive(0)
  }
  const choose = (entry: ReturnType<typeof options>[number]) => {
    const current = mention()
    const textarea = input.textarea()
    if (!current || !textarea) return
    const placed = placeMention(textarea.value, current, entry.item.name)
    input.onText(placed.text)
    if (!entry.store.picked().includes(entry.item.id)) entry.store.pick(entry.item.id, entry.max)
    setMention(undefined)
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(placed.caret, placed.caret)
    })
  }

  // The keys the open list takes for itself.
  const keys = ["ArrowDown", "ArrowUp", "Escape", "Enter", "Tab"]

  return {
    look,
    keys,
    close: () => setMention(undefined),
    // Arrow keys move through the list, Enter or Tab picks, Escape closes it. Returns whether the
    // key was the list's, so the composer does not also send.
    onKeyDown: (event: KeyboardEvent) => {
      if (!open() || event.isComposing) return false
      const count = options().length
      if (event.key === "ArrowDown") setActive((index) => (index + 1) % count)
      if (event.key === "ArrowUp") setActive((index) => (index - 1 + count) % count)
      if (event.key === "Escape") setMention(undefined)
      const entry = options()[active()]
      if ((event.key === "Enter" || event.key === "Tab") && entry) choose(entry)
      const handled = keys.includes(event.key)
      if (handled) event.preventDefault()
      return handled
    },
    // What the textarea tells assistive technology about the list.
    aria: () => ({
      "aria-autocomplete": "list" as const,
      "aria-controls": open() ? id : undefined,
      "aria-activedescendant": open() ? `${id}-${active()}` : undefined,
    }),
    List: () => (
      <Show when={open()}>
        <ul
          id={id}
          role="listbox"
          aria-label={t("mentions.label")}
          class="absolute bottom-full left-0 z-(--z-popover) mb-2 max-h-72 w-[min(320px,100%)] overflow-y-auto rounded-[16px] bg-elevated bg-sheen p-1.5 shadow-floating animate-fade-in"
        >
          <For each={options()}>
            {(entry, index) => (
              <li
                id={`${id}-${index()}`}
                role="option"
                aria-selected={index() === active()}
                class="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-1.5 text-callout text-label aria-selected:bg-fill-2"
                // A press keeps the focus in the prompt, so a phone's keyboard stays up and the list
                // does not close before the click lands.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(entry)}
                onMouseEnter={() => setActive(index())}
              >
                <SavedThumb saved={entry.item} kind={entry.store.kind} class="size-7" />
                <span class="min-w-0 flex-1 truncate">{entry.item.name}</span>
                <span class="shrink-0 text-caption text-label-2">{t(`${entry.store.kind}.picker`)}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    ),
  }
}
