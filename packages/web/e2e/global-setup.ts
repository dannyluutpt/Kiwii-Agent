import { createHash, randomBytes } from "node:crypto"
import { execFileSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

export const STATE = fileURLToPath(new URL(".auth/state.json", import.meta.url))
const API_DIR = fileURLToPath(new URL("../../api", import.meta.url))

// Signs in a fixed test user by writing a session straight into the local D1 database that
// `wrangler dev` serves, then hands the cookie to every test through storage state. Local only.
export default function globalSetup() {
  const token = randomBytes(32).toString("hex")
  const hash = createHash("sha256").update(token).digest("hex")
  const now = Date.now()
  const sql = [
    "DELETE FROM sessions WHERE user_id = 'e2e-user'",
    "DELETE FROM conversations WHERE user_id = 'e2e-user'",
    `INSERT OR IGNORE INTO users (id, email, password_hash, password_salt, password_iterations, tier, locale, created_at) VALUES ('e2e-user', 'e2e@kiwii.test', 'x', 'x', 1, 'free', 'vi', ${now})`,
    `INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ('${hash}', 'e2e-user', ${now + 86_400_000}, ${now})`,
    `INSERT INTO conversations (id, user_id, title, model, last_message_at, created_at) VALUES ('e2e-conv-1', 'e2e-user', 'Kế hoạch du lịch Đà Lạt', 'mock', ${now}, ${now}), ('e2e-conv-2', 'e2e-user', 'Viết email xin nghỉ phép', 'mock', ${now - 1000}, ${now})`,
  ].join("; ")
  execFileSync("bunx", ["wrangler", "d1", "execute", "kiwii", "--local", "--command", sql], {
    cwd: API_DIR,
    stdio: "ignore",
  })
  mkdirSync(fileURLToPath(new URL(".auth", import.meta.url)), { recursive: true })
  writeFileSync(
    STATE,
    JSON.stringify({
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
    }),
  )
}
