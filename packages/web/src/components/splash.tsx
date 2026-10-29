import { Show } from "solid-js"
import { BRAND } from "@/brand"
import { Button } from "@/ui/button"
import { Spinner } from "@/ui/spinner"

// First screen while the session check runs, and the place to land when that check cannot reach
// the server. Copy is inline because the language provider may not have a user locale yet.
export function Splash(props: { failed?: boolean; onRetry?: () => void }) {
  return (
    <div class="flex h-full flex-col items-center justify-center gap-6 bg-ambient p-6 text-center">
      <img src="/logo.svg" alt={BRAND} class="size-16 rounded-[18px] shadow-glow" />
      <Show when={props.failed} fallback={<Spinner class="size-6 text-label-3" label={`Đang tải ${BRAND}`} />}>
        <div class="flex max-w-xs flex-col items-center gap-3">
          <p class="text-headline text-label">Không kết nối được tới {BRAND}</p>
          <p class="text-subhead text-label-2">Kiểm tra mạng rồi thử lại.</p>
          <Button variant="primary" onClick={() => props.onRetry?.()}>
            Thử lại
          </Button>
        </div>
      </Show>
    </div>
  )
}
