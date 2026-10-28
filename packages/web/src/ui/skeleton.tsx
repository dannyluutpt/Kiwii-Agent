// Placeholder shape shown while content loads. Hidden from assistive tech; mark the loading region
// with aria-busy instead.
export function Skeleton(props: { class?: string }) {
  return <div aria-hidden="true" class={`k-skeleton rounded-[8px] ${props.class ?? "h-4 w-full"}`} />
}
