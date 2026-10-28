import { Toast, toaster } from "@kobalte/core/toast"
import { Match, Show, Switch } from "solid-js"
import { Portal } from "solid-js/web"
import { IconCheck, IconClose } from "@/components/icons"
import { useLanguage } from "@/context/language"
import { buttonClass } from "./button"

type Variant = "default" | "success" | "error"
type Options = { description?: string; action?: { label: string; onClick: () => void }; duration?: number }

// Banner-style notifications that drop from the top edge (clear of the tab bar and the keyboard).
// Kobalte provides the live region, pause on hover/focus and swipe to dismiss.
export function ToastRegion() {
  return (
    <Portal>
      <Toast.Region duration={4500} limit={3} swipeDirection="up" pauseOnInteraction>
        <Toast.List class="fixed inset-x-0 top-0 z-(--z-toast) mx-auto flex w-full max-w-[420px] flex-col gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] outline-none md:right-4 md:left-auto md:mx-0 md:px-0 md:pt-4" />
      </Toast.Region>
    </Portal>
  )
}

function show(variant: Variant, title: string, options?: Options) {
  return toaster.show((props) => (
    <ToastView toastId={props.toastId} variant={variant} title={title} options={options} />
  ))
}

// Rendered inside the region, so app context (language) is available here.
function ToastView(props: { toastId: number; variant: Variant; title: string; options?: Options }) {
  const { t } = useLanguage()
  return (
    <Toast
      toastId={props.toastId}
      duration={props.options?.duration}
      class="k-toast flex w-full items-start gap-3 rounded-[18px] bg-elevated p-3 pl-3.5 shadow-floating"
    >
      <Show when={props.variant !== "default"}>
        <span
          class="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full"
          classList={{
            "bg-success-soft text-success": props.variant === "success",
            "bg-danger-soft text-danger": props.variant === "error",
          }}
        >
          <Switch>
            <Match when={props.variant === "success"}>
              <IconCheck class="size-3.5" weight={2.5} />
            </Match>
            <Match when={props.variant === "error"}>
              <span class="text-subhead font-bold leading-none">!</span>
            </Match>
          </Switch>
        </span>
      </Show>
      <div class="min-w-0 flex-1 py-0.5">
        <Toast.Title class="text-subhead font-semibold text-label">{props.title}</Toast.Title>
        <Show when={props.options?.description}>
          <Toast.Description class="mt-0.5 text-footnote text-label-2">{props.options?.description}</Toast.Description>
        </Show>
      </div>
      <Show when={props.options?.action}>
        {(action) => (
          <button
            type="button"
            class={buttonClass("tinted", "sm")}
            onClick={() => {
              action().onClick()
              toaster.dismiss(props.toastId)
            }}
          >
            {action().label}
          </button>
        )}
      </Show>
      <Toast.CloseButton
        aria-label={t("common.close")}
        class="-mr-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-label-3 hover:bg-fill hover:text-label"
      >
        <IconClose class="size-4" />
      </Toast.CloseButton>
    </Toast>
  )
}

export const toast = {
  show: (title: string, options?: Options) => show("default", title, options),
  success: (title: string, options?: Options) => show("success", title, options),
  error: (title: string, options?: Options) => show("error", title, options),
}
