import { test as base, expect } from "@playwright/test"

// The local Worker rate-limits by client IP and, unlike production behind Cloudflare, takes the
// address from this header; give each test its own so a full run never trips the limit.
export const test = base.extend({
  extraHTTPHeaders: async ({}, use, testInfo) => {
    const n = Array.from(testInfo.testId).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 64_000, 7)
    await use({ "cf-connecting-ip": `10.${testInfo.retry}.${Math.floor(n / 250)}.${(n % 250) + 1}` })
  },
})

export { expect }
export type { Page } from "@playwright/test"
