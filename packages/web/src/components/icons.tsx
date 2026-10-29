import type { JSX } from "solid-js"

// Line icons drawn on a 24px grid in the spirit of SF Symbols. Each export renders fresh nodes, so
// one icon can appear in many places at once.
type IconProps = { class?: string; weight?: number }

function icon(render: () => JSX.Element) {
  return (props: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={props.weight ?? 1.75}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={props.class ?? "size-5"}
      aria-hidden="true"
    >
      {render()}
    </svg>
  )
}

export const IconImage = icon(() => (
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3.5" />
    <circle cx="9" cy="9.75" r="1.75" />
    <path d="m20.5 15.5-4.6-4.3a1 1 0 0 0-1.4 0L7 18.5" />
  </>
))

export const IconLibrary = icon(() => (
  <>
    <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="2" />
    <rect x="13" y="3.5" width="7.5" height="7.5" rx="2" />
    <rect x="3.5" y="13" width="7.5" height="7.5" rx="2" />
    <rect x="13" y="13" width="7.5" height="7.5" rx="2" />
  </>
))

export const IconPerson = icon(() => (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="10" r="2.75" />
    <path d="M6.8 18.2c1.2-1.9 3-2.9 5.2-2.9s4 1 5.2 2.9" />
  </>
))

export const IconSidebar = icon(() => (
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3.5" />
    <path d="M9.5 4.5v15" />
  </>
))

export const IconPlus = icon(() => <path d="M12 5v14M5 12h14" />)

export const IconClose = icon(() => <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />)

export const IconChevronLeft = icon(() => <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />)

export const IconChevronRight = icon(() => <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />)

export const IconChevronDown = icon(() => <path d="m5.5 9.5 6.5 6.5 6.5-6.5" />)

export const IconEllipsis = icon(() => (
  <>
    <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </>
))

export const IconTrash = icon(() => (
  <>
    <path d="M4.5 6.5h15" />
    <path d="M9.5 6.5V5A1.5 1.5 0 0 1 11 3.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
    <path d="m6.5 6.5.8 11.6a2.5 2.5 0 0 0 2.5 2.4h4.4a2.5 2.5 0 0 0 2.5-2.4l.8-11.6" />
    <path d="M10 10.5v6M14 10.5v6" />
  </>
))

export const IconPencil = icon(() => (
  <>
    <path d="M15.6 4.4a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4z" />
    <path d="m13.5 6.5 3 3" />
  </>
))

export const IconArrowUp = icon(() => <path d="M12 19V5M5.5 11.5 12 5l6.5 6.5" />)

export const IconStop = icon(() => (
  <rect x="7" y="7" width="10" height="10" rx="2.5" fill="currentColor" stroke="none" />
))

export const IconRefresh = icon(() => (
  <>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
    <path d="M19.5 4.5v4h-4" />
  </>
))

export const IconCopy = icon(() => (
  <>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 8.5V7A2.5 2.5 0 0 0 13 4.5H7A2.5 2.5 0 0 0 4.5 7v6A2.5 2.5 0 0 0 7 15.5h1.5" />
  </>
))

export const IconCheck = icon(() => <path d="m5 12.5 4.5 4.5L19 7.5" />)

export const IconDownload = icon(() => <path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />)

export const IconSparkles = icon(() => (
  <>
    <path d="M11 4.5l1.5 4a3 3 0 0 0 1.8 1.8l4 1.5-4 1.5a3 3 0 0 0-1.8 1.8l-1.5 4-1.5-4a3 3 0 0 0-1.8-1.8l-4-1.5 4-1.5a3 3 0 0 0 1.8-1.8z" />
    <path d="M18.5 3v3M17 4.5h3" />
  </>
))

export const IconSliders = icon(() => (
  <>
    <path d="M4 7.5h9M17.5 7.5H20M4 16.5h3.5M11.5 16.5H20" />
    <circle cx="15.25" cy="7.5" r="2.25" />
    <circle cx="9.25" cy="16.5" r="2.25" />
  </>
))

export const IconStar = icon(() => <path d="m12 3.8 2.5 5.1 5.6.8-4 4 .9 5.6-5-2.6-5 2.6.9-5.6-4-4 5.6-.8z" />)

export const IconLogout = icon(() => (
  <>
    <path d="M13.5 4.5H7.5a3 3 0 0 0-3 3v9a3 3 0 0 0 3 3h6" />
    <path d="M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5" />
  </>
))

export const IconGlobe = icon(() => (
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M3.5 12h17M12 3.5c2.3 2.4 3.4 5.2 3.4 8.5s-1.1 6.1-3.4 8.5c-2.3-2.4-3.4-5.2-3.4-8.5s1.1-6.1 3.4-8.5Z" />
  </>
))

export const IconSearch = icon(() => (
  <>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </>
))

export const IconEye = icon(() => (
  <>
    <path d="M2.75 12S6.25 5.5 12 5.5 21.25 12 21.25 12 17.75 18.5 12 18.5 2.75 12 2.75 12Z" />
    <circle cx="12" cy="12" r="3" />
  </>
))

export const IconEyeSlash = icon(() => (
  <>
    <path d="M9.9 5.75A9.6 9.6 0 0 1 12 5.5C17.75 5.5 21.25 12 21.25 12a17 17 0 0 1-2.6 3.4M14.1 14.2a3 3 0 0 1-4.3-4.3" />
    <path d="M6.6 7.1C4.05 8.85 2.75 12 2.75 12S6.25 18.5 12 18.5c1.7 0 3.2-.55 4.45-1.35" />
    <path d="m4 4 16 16" />
  </>
))

export const IconCreditCard = icon(() => (
  <>
    <rect x="3.5" y="5.5" width="17" height="13" rx="3" />
    <path d="M3.5 10h17M7.5 14.5h3" />
  </>
))

export const IconArrowRight = icon(() => <path d="M4.5 12h15M13.5 6l6 6-6 6" />)

export const IconPlay = icon(() => (
  <path d="M8 5.6v12.8a1 1 0 0 0 1.5.86l10.6-6.4a1 1 0 0 0 0-1.72L9.5 4.74A1 1 0 0 0 8 5.6z" />
))

export const IconWand = icon(() => (
  <>
    <path d="m4.5 19.5 10-10M13 8l3 3" />
    <path d="M17.5 3.5v3M16 5h3M19.5 11v2M18.5 12h2M9.5 3.5v2M8.5 4.5h2" />
  </>
))

export const IconChat = icon(() => (
  <path d="M20.5 11.5c0 4.15-3.8 7.5-8.5 7.5a9.6 9.6 0 0 1-3.2-.55L4 20l1.4-3.7A7 7 0 0 1 3.5 11.5C3.5 7.35 7.3 4 12 4s8.5 3.35 8.5 7.5z" />
))
