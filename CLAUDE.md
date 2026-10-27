# Working rules for Claude in this repo

Read `AGENTS.md` first; it holds the build commands and code style.

## Do it yourself

- Never hand the user a task you can do with the tools in this session (Cloudflare connector,
  GitHub tools, shell, browser). Create databases, buckets, migrations, workflows, comments and
  pushes directly. Only ask for what truly needs their credentials or account (API keys, payment,
  OAuth logins, dashboard-only settings), and when you do, say exactly why it cannot be done here.
- When a step needs their input, batch every such item into one short list with direct links,
  once, instead of asking piecemeal.
- Prefer automation that removes the manual step for next time (a workflow, a script, a config)
  over describing commands for the user to run.

## Language

- Reply in Vietnamese with full diacritics unless the user writes in English. Code, commit
  messages and PR text stay in English.
