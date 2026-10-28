# @kiwii/web

The Kiwii web app (chat and image studio) at https://kiwiiagent.com: a SolidJS single-page app that
`@kiwii/api` serves as static assets from the same Worker.

## Develop

```sh
# terminal 1: model stand-in so nothing spends OpenRouter credits
cd packages/api && bun script/mock-openrouter.ts
# terminal 2: the Worker, with OPENROUTER_BASE_URL=http://localhost:8899 in packages/api/.dev.vars
cd packages/api && bunx wrangler dev --port 8787
# terminal 3: hot-reloading UI on :5173, proxying /api to :8787 (API_PORT overrides the port)
cd packages/web && bun run dev
```

Checks: `bun run typecheck`, `bun test src` (unit), `bun run e2e` (browser; see below).

## Design system

Everything visual comes from `src/styles/`:

- `tailwind.css`: the Tailwind entry. Tailwind's theme layer and preflight, utilities generated from
  this package only (`src/` and `index.html`), and a reset theme with just the base scale (spacing,
  breakpoints, `max-w-*` widths, two weights, spin/ping/pulse). The web app does not load
  `@kiwii/ui`'s stylesheet, which carries the desktop app's component CSS.
- `tokens.css`: semantic colours (`bg-canvas`, `bg-surface`, `text-label-2`, `bg-accent`, …), the type
  scale (`text-large-title` … `text-caption-2`), named radii (`rounded-control`, `rounded-card`,
  `rounded-panel`, `rounded-sheet`), elevation (`shadow-raised`, `shadow-floating`, `shadow-overlay`),
  motion durations and easings, safe-area and `glass` utilities. With the theme reset, anything not
  listed in these two files does not exist.
- `theme.css`: the light and dark values, keyed on `html[data-color-scheme]`. The accent used for
  text and filled buttons is a deeper kiwi green chosen for WCAG AA contrast; the brand green is
  kept for focus rings and marks.
- `components.css`: enter and exit animations driven by Kobalte's `data-expanded` / `data-closed`
  attributes, the spinner and skeleton.

Components live in `src/ui/` (Button, IconButton, TextField, Dialog with `askConfirm`/`askText`,
Sheet that closes with a drag, Menu, Popover, Segmented, Switch, List, Toast, Tooltip, Skeleton,
Tag, Avatar). They wrap Kobalte for behaviour and keyboard support and are sized for touch: 44px
targets on coarse pointers, 16px text in inputs so iOS does not zoom. Prefer them over raw elements; never nest a `<button>` inside a link, use
`buttonClass()` on the link instead.

Layout: phones (< 768px) get the bottom tab bar, tablets open the sidebar as a drawer, desktops
(≥ 1024px) dock it and can collapse it (Ctrl/⌘ + Shift + S). Screens with a large title use
`components/page.tsx`; screens with their own scroller use `components/top-bar.tsx` directly and pad
by `pb-tabbar`.

The image studio (`pages/images.tsx`) is a control panel (`components/studio-panel.tsx`) beside a
masonry gallery of runs (`components/generation-tile.tsx`) from 768px, and the gallery over a docked
composer with a bottom sheet (`components/studio-prompt-bar.tsx`) on phones. A run appears in the
gallery the moment it is asked for. Reference photos are scaled in the browser to the chosen model's
longest edge (`lib/image.ts`, `components/references.tsx`) before they are uploaded.

## End-to-end tests

`e2e/` drives the real app with Playwright against a local Worker on :8790. The global setup writes a
test user and session straight into the local D1 database, so nothing touches production.

```sh
cd packages/api && bun script/mock-openrouter.ts & bunx wrangler dev --port 8790
cd packages/web && bun run build && bun run e2e
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an already installed Chromium.
