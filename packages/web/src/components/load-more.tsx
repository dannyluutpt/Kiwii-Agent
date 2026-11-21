import { createEffect, on, onCleanup, onMount, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { Button } from "@/ui/button"

// End of a paged list: the next page loads as this marker nears the bottom of its scroller
// (an ancestor marked `data-scroller`), and keyboard users still get a button.
// After a page that `failed` it stops asking on its own: offline, every answer would ask again at once,
// without end. The button stays, and says to try again.
export function LoadMore(props: { more: boolean; loading: boolean; failed?: boolean; onLoad: () => void }) {
  const { t } = useLanguage()
  let marker: HTMLDivElement | undefined
  let visible = false

  onMount(() => {
    if (!marker) return
    const observer = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting)
        if (visible && props.more && !props.loading && !props.failed) props.onLoad()
      },
      { root: marker.closest("[data-scroller]"), rootMargin: "0px 0px 800px 0px" },
    )
    observer.observe(marker)
    onCleanup(() => observer.disconnect())
  })

  // A page that lands while the end is still in view does not move the marker out and back in, so
  // ask for the next one directly.
  createEffect(
    on(
      () => props.loading,
      (loading, was) => {
        if (was && !loading && visible && props.more && !props.failed) props.onLoad()
      },
    ),
  )

  return (
    <div ref={marker} class="flex min-h-px justify-center pt-4">
      <Show when={props.more && !props.loading}>
        <Button variant="secondary" onClick={() => props.onLoad()}>
          {props.failed ? t("common.retry") : t("images.loadMore")}
        </Button>
      </Show>
    </div>
  )
}
