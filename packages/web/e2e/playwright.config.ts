import { defineConfig, devices } from "@playwright/test"
import { STATE } from "./global-setup"

// End-to-end checks of the web app against a local Worker:
//   cd packages/api && bun script/mock-openrouter.ts & bunx wrangler dev --port 8790
//   cd packages/web && bun run build && bun run e2e
// PLAYWRIGHT_CHROMIUM_EXECUTABLE points at a preinstalled browser when Playwright's own is absent.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
const launchOptions = executablePath ? { executablePath } : {}

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  // One local database and one rate limiter: run tests one at a time.
  workers: 1,
  globalSetup: "./global-setup.ts",
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:8790",
    storageState: STATE,
    locale: "vi-VN",
    launchOptions,
  },
  projects: [
    { name: "phone", use: { ...devices["iPhone 15"], browserName: "chromium", storageState: STATE, launchOptions } },
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 900 }, browserName: "chromium", storageState: STATE, launchOptions },
    },
  ],
})
