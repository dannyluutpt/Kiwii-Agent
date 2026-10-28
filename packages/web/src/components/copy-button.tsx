import { createSignal, onCleanup, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { IconButton } from "@/ui/icon-button"
import { toast } from "@/ui/toast"
import { IconCheck, IconCopy } from "./icons"

// Copies a value and answers in place: the icon turns into a check for a moment, and screen
// readers hear the confirmation through a polite live region.
export function CopyButton(props: { value: string; label: string }) {
  const { t } = useLanguage()
  const [copied, setCopied] = createSignal(false)
  let timer: ReturnType<typeof setTimeout> | undefined
  onCleanup(() => clearTimeout(timer))

  const copy = () =>
    void navigator.clipboard.writeText(props.value).then(
      () => {
        setCopied(true)
        clearTimeout(timer)
        timer = setTimeout(() => setCopied(false), 1800)
      },
      () => toast.error(t("error.generic")),
    )

  return (
    <>
      <IconButton
        label={props.label}
        size="sm"
        icon={
          <Show when={copied()} fallback={<IconCopy class="size-[18px]" />}>
            <IconCheck class="size-[18px] text-success" weight={2.25} />
          </Show>
        }
        onClick={copy}
      />
      <span class="sr-only" aria-live="polite">
        {copied() ? t("common.copied") : ""}
      </span>
    </>
  )
}
