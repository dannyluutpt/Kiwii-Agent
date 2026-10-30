import { createHash, randomBytes } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

// Free account: upgrade prompts, locked image studio.
export const STATE = fileURLToPath(new URL(".auth/state.json", import.meta.url))
// Paid account with credits: the image studio and the library.
export const PRO_STATE = fileURLToPath(new URL(".auth/pro.json", import.meta.url))
const API_DIR = fileURLToPath(new URL("../../api", import.meta.url))
const DAY = 86_400_000

// Signs in two fixed test users by writing sessions straight into the local D1 database that
// `wrangler dev` serves, then hands the cookies to the tests through storage state. Local only.
export default function globalSetup() {
  const now = Date.now()
  const free = session()
  const pro = session()
  const sql = [
    "DELETE FROM sessions WHERE user_id IN ('e2e-user', 'e2e-pro')",
    "DELETE FROM generation_images WHERE generation_id IN (SELECT id FROM generations WHERE user_id = 'e2e-pro')",
    "DELETE FROM generations WHERE user_id = 'e2e-pro'",
    "DELETE FROM projects WHERE user_id IN ('e2e-user', 'e2e-pro')",
    "DELETE FROM characters WHERE user_id = 'e2e-pro'",
    "DELETE FROM locations WHERE user_id = 'e2e-pro'",
    "DELETE FROM credit_ledger WHERE user_id = 'e2e-pro'",
    "DELETE FROM credit_grants WHERE user_id = 'e2e-pro'",
    "DELETE FROM plan_orders WHERE user_id IN ('e2e-user', 'e2e-pro')",
    "DELETE FROM plan_events WHERE user_id IN ('e2e-user', 'e2e-pro')",
    // Transfers reported by the billing spec carry this tag in their content.
    "DELETE FROM bank_events WHERE content LIKE '%E2E%'",
    `INSERT OR IGNORE INTO users (id, email, password_hash, password_salt, password_iterations, tier, locale, created_at) VALUES ('e2e-user', 'e2e@kiwii.test', 'x', 'x', 1, 'free', 'vi', ${now})`,
    `INSERT OR REPLACE INTO users (id, email, password_hash, password_salt, password_iterations, tier, tier_until, locale, created_at) VALUES ('e2e-pro', 'pro@kiwii.test', 'x', 'x', 1, 'plus', ${now + 30 * DAY}, 'vi', ${now})`,
    `INSERT INTO credit_grants (id, user_id, source, amount, remaining, expires_at, created_at) VALUES ('e2e-pro-grant', 'e2e-pro', 'bonus', 5000, 5000, ${now + 30 * DAY}, ${now})`,
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ('${free.hash}', 'e2e-user', ${now + DAY}, ${now}), ('${pro.hash}', 'e2e-pro', ${now + DAY}, ${now})`,
    // An order left unpaid past its 24 hours, for the expired checkout screen.
    `INSERT INTO plan_orders (id, user_id, kind, item_id, amount_vnd, memo, status, expires_at, created_at) VALUES ('e2e-order-expired', 'e2e-user', 'plan', 'starter', 299000, 'KWE2EOLD01', 'pending', ${now - DAY}, ${now - 2 * DAY})`,
    // Production prices GPT Image's two top qualities, so the studio offers five of them.
    `INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES ('image_models', '{"gpt-image-2.5":{"xhigh":15,"max":28}}', ${now})`,
  ].join("; ")
  execFileSync("bunx", ["wrangler", "d1", "execute", "kiwii", "--local", "--command", sql], {
    cwd: API_DIR,
    stdio: "ignore",
  })
  mkdirSync(fileURLToPath(new URL(".auth", import.meta.url)), { recursive: true })
  writeFileSync(STATE, storage(free.token))
  writeFileSync(PRO_STATE, storage(pro.token))
}

function session() {
  const token = randomBytes(32).toString("hex")
  return { token, hash: createHash("sha256").update(token).digest("hex") }
}

function storage(token: string) {
  return JSON.stringify({
    cookies: [
      {
        name: "kiwii_session",
        value: token,
        domain: "localhost",
        path: "/",
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ],
    origins: [],
  })
}
