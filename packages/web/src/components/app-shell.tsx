import type { ParentProps } from "solid-js"
import { Sidebar } from "./sidebar"

export function AppShell(props: ParentProps) {
  return (
    <div class="flex h-dvh overflow-hidden bg-background-base">
      <Sidebar />
      <main class="flex min-w-0 flex-1 flex-col">{props.children}</main>
    </div>
  )
}
