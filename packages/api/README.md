# @kiwii/api

Cloudflare Worker behind the Kiwii web app. Serves `/api/*` from `src/index.ts` and the built
frontend from `../web/dist` as static assets.

## Local development

```sh
cp .dev.vars.example .dev.vars           # fill in OPENROUTER_API_KEY; LOG_EMAIL=1 prints OTPs
bun db:migrate:local                     # applies ./migration to the local D1
bun run --cwd ../web build               # or `bun dev` in ../web for hot reload on :5173
bun dev                                  # wrangler dev on :8787
```

`bun dev` in `../web` proxies `/api` to `:8787`, so run both for hot reload. Without
`OPENROUTER_API_KEY`, image runs answer `LLM_NOT_CONFIGURED`; set `OPENROUTER_BASE_URL` to point at
the mock server (`bun script/mock-openrouter.ts`) to test offline.

## Deploying

Cloudflare Workers Builds deploys the `kiwii-agent` Worker on every push to `main`:

- Root directory: `packages/api`
- Build command: `bun run --cwd ../web build && bunx wrangler d1 migrations apply kiwii --remote`
- Deploy command: `bunx wrangler deploy`

Every push builds and deploys on its own, and builds can finish out of order: two merges a minute
apart once left the older commit live, deployed last. Merge one change to `main` at a time and let
its deployment finish before the next.

Runtime configuration lives in the Worker's Settings → Variables and Secrets, never in
`wrangler.jsonc` (`keep_vars` keeps dashboard values across deploys):

- secrets: `OPENROUTER_API_KEY`, `SEPAY_API_KEY`, `TURNSTILE_SECRET_KEY`
- variables: `TURNSTILE_SITE_KEY`

The receiving bank account (`SEPAY_BANK_*`) is public information printed on every QR code, so it
is versioned in `wrangler.jsonc`.

For a manual deploy, `bun run deploy` from this directory.

## Schema changes

Edit `src/db/schema.ts`, run `bun db:generate`, then copy the generated `drizzle/*/migration.sql`
into `migration/NNNN_name.sql`. Wrangler tracks applied files by name, so never edit a migration
that has already been applied remotely.

## Image generation

`src/images/models.ts` holds the three models, their options and credit prices. GPT `xhigh` and
`max` ship with `credits: null` (hidden in the UI) until measured. To price them against real
OpenRouter costs and write the result to `app_config.image_models` on production D1:

```sh
OPENROUTER_API_KEY=sk-or-... bun script/calibrate-image-cost.ts --only gpt-image-2.5 --apply
```

The API merges that config on every request, so no deploy is needed after `--apply`.

Measured on 2026-10-27 through production (1:1 is the most expensive ratio): low 0.008, medium
0.018, high 0.057, xhigh 0.098, max 0.215 USD per image. The sold ladder keeps the agreed
High = 10 and sets XHigh = 15, Max = 28 in `app_config.image_models`; the formula alone would
give 1 / 1 / 3 / 5 / 10, so every GPT tier carries a wide margin.

## Projects

`/api/projects` lists, creates, renames and deletes a person's projects (`src/projects/store.ts`).
A run joins one through `projectID` on `POST /api/images/generations`, and
`GET /api/images/generations?project=<id>` lists only its runs. A project starts without a name and
takes the opening words of its first prompt; "new project" again while an unnamed one is still empty
returns that one. Deleting a project moves its runs back to "all" (`project_id` null); no picture is
lost.

Everything a run needs before it starts (access, price, project, references, screening and rewrite,
the credit hold, the row) is `prepareGeneration` in `src/images/prepare.ts`, and what the browser
sees of a run is `presentGeneration` in `src/images/present.ts`, so every route that makes pictures
shares them.

## Retired chat

The general chat (conversations, file tools, web search) was removed in favour of image
generation. Its D1 tables (`conversations`, `messages`, `chat_usage`), the `plans.chat_*` columns and
old `files` rows of kind `attachment`/`generated` with their R2 objects remain; nothing reads them,
and they must not be dropped without a backup.
