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

Secrets (`OPENROUTER_API_KEY`, `DOWNLOAD_SIGNING_SECRET`, …) live in the Worker's
Settings → Variables and Secrets. For a manual deploy, `bun run deploy` from this directory.

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
