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
`OPENROUTER_API_KEY`, chat answers `LLM_NOT_CONFIGURED`; set `OPENROUTER_BASE_URL` to point at a
mock server when testing streaming offline.

## Deploying

Cloudflare Workers Builds deploys the `kiwii-agent` Worker on every push to `main`:

- Root directory: `packages/api`
- Build command: `bun run --cwd ../web build && bunx wrangler d1 migrations apply kiwii --remote`
- Deploy command: `bunx wrangler deploy`

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

## Chat tools and attachments

Paid plans chat with MiMo and get three function-calling tools (`src/chat/tools/`):
`create_docx`, `create_xlsx` and `create_code_file`. Results are stored in R2 under `u/<user>/`
and returned as `file` message parts; `GET /api/chat/files/:id` serves them owner-checked.
Users can attach up to five text-like files (1 MB each) through `POST /api/chat/files`; their
content is inlined into the model context. Free models never receive tools.
