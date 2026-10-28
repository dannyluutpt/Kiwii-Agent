import { describe, expect, test } from "bun:test"
import { searchWeb } from "../src/chat/tools/search"

describe("searchWeb", () => {
  test("asks OpenRouter with the web plugin and returns the summary with unique sources", async () => {
    const original = globalThis.fetch
    let sent: Record<string, unknown> | undefined
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({
        choices: [
          {
            message: {
              content: "  SJC là 150 triệu.  ",
              annotations: [
                { type: "url_citation", url_citation: { url: "https://a.vn/1", title: "A", content: "x".repeat(500) } },
                { type: "url_citation", url_citation: { url: "https://a.vn/1", title: "A again" } },
                { type: "other" },
                { type: "url_citation", url_citation: { url: "https://b.vn/2" } },
              ],
            },
          },
        ],
        usage: { cost: 0.0071 },
      })
    }) as typeof fetch
    try {
      const out = await searchWeb({ query: "giá vàng" }, { apiKey: "k", now: new Date("2026-10-28T11:00:00Z") })
      expect(out.summary).toBe("SJC là 150 triệu.")
      expect(out.results).toEqual([
        { title: "A", url: "https://a.vn/1", excerpt: "x".repeat(400) },
        { title: "https://b.vn/2", url: "https://b.vn/2", excerpt: "" },
      ])
      expect(out.costUsd).toBe(0.0071)
      expect(sent?.plugins).toEqual([{ id: "web", engine: "exa", mode: "fast", max_results: 6 }])
      expect(JSON.stringify(sent?.messages)).toContain("2026-10-28")
    } finally {
      globalThis.fetch = original
    }
  })

  test("rejects an empty query", async () => {
    await expect(searchWeb({ query: "" }, { apiKey: "k", now: new Date() })).rejects.toThrow()
  })
})
