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

1. `wrangler d1 create kiwii` once and paste the id into `wrangler.jsonc`.
2. `wrangler r2 bucket create kiwii-files` once.
3. `wrangler secret put OPENROUTER_API_KEY` (and the other secrets listed in `wrangler.jsonc`).
4. `bun db:migrate` then `bun run deploy`.

## Schema changes

Edit `src/db/schema.ts`, run `bun db:generate`, then copy the generated `drizzle/*/migration.sql`
into `migration/NNNN_name.sql`. Wrangler tracks applied files by name, so never edit a migration
that has already been applied remotely.
