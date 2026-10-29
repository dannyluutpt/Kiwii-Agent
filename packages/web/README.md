# @kiwii/web

The Amberpix web app (image studio) at https://kiwiiagent.com: a SolidJS single-page app that
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
  `rounded-panel`, `rounded-sheet`), elevation (`shadow-raised`, `shadow-floating`, `shadow-overlay`,
  `shadow-glow`), motion durations and easings, safe-area, `glass`, `glass-panel` and `bg-ambient`
  utilities. With the theme reset, anything not listed in these two files does not exist.
- `theme.css`: the one colour scheme, dark: near-black surfaces and an amber-yellow accent
  (`#ffd60a`). Text on the yellow is always black; `src/styles/contrast.test.ts` checks the main
  pairs against WCAG AA.
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

The workspace (`pages/studio.tsx`) lives at `/` (every run) and `/p/:projectId` (one project); the
library is `/library`, and the old `/images` addresses redirect. From 768px it has three columns:
the project sidebar (`components/project-sidebar.tsx`: new project, search with Ctrl/⌘ + K, projects
grouped by last activity), the gallery of runs with filter chips (`components/gallery.tsx`,
`components/generation-tile.tsx`), and the panel that makes pictures (`components/studio-panel.tsx`).
Phones keep the gallery over a docked composer with a bottom sheet (`components/studio-prompt-bar.tsx`)
and make pictures into "all".

State sits above the screens: `context/projects.tsx` holds the project list and its flows, and
`context/studio.tsx` holds the options, the draft and every run seen this session with the galleries
that list them, so a run keeps streaming into its tile while another project is open. A run appears
in the gallery the moment it is asked for. Reference photos are scaled in the browser to the chosen
model's longest edge (`lib/image.ts`, `components/references.tsx`) before they are uploaded.

## Home Screen app

`public/manifest.webmanifest` makes the site, once added to the Home Screen, open full screen like an
app on iOS and Android (`display: standalone`, the whole site in scope, starting at `/`); without
it iOS 26 keeps the browser bars. A phone reads the manifest only when the icon is added, so a change
to it shows after the icon is removed and added again.

In that app a download link opens a file preview with no way back, and iPhone keeps pictures in
Photos anyway, so on iPhone and iPad the viewer's Download hands the picture
to the share sheet instead ("Lưu hình ảnh", "Lưu vào Tệp"; `lib/save.ts`). Other devices download.

The mark (a black "A" whose crossbar is a pixel, on amber yellow) is drawn by `script/icons.ts`,
which writes `public/logo.svg` (in-app logo and favicon), `public/logo.png` and the Home Screen
icons in `public/icons/`. Those are full-bleed and opaque, since iOS paints transparent areas black
and rounds the corners itself; the maskable one shrinks the glyph to 80% so Android's masks never
cut it. After changing the mark, run from this folder:

```sh
bun script/icons.ts
```

The product name lives in `src/brand.ts` (and `packages/api/src/brand.ts`); strings say `{{brand}}`
and `t()` fills it in. `index.html` and the manifest spell it out, and `src/brand.test.ts` keeps
them in step.

## End-to-end tests

`e2e/` drives the real app with Playwright against a local Worker on :8790. The global setup writes a
test user and session straight into the local D1 database, so nothing touches production.

```sh
cd packages/api && bun script/mock-openrouter.ts & bunx wrangler dev --port 8790
cd packages/web && bun run build && bun run e2e
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE` to use an already installed Chromium.
