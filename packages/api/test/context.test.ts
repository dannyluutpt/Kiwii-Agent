import { describe, expect, test } from "bun:test"
import { buildContext, estimateTokens, SYSTEM_PROMPT, systemPrompt } from "../src/chat/context"

describe("buildContext", () => {
  test("keeps system prompt and newest message even over budget", () => {
    const now = new Date("2026-10-28T11:33:00Z")
    const out = buildContext([{ role: "user", parts: [{ type: "text", text: "x".repeat(10_000) }] }], 100, now)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ role: "system", content: systemPrompt(now) })
    // 18:33 in Vietnam, so the assistant can answer "what time is it".
    expect(out[0]?.content).toContain("18:33")
    expect(out[0]?.content).toContain("28 tháng 10, 2026")
    expect(out[0]?.content).toContain(SYSTEM_PROMPT)
    expect(out[1]?.role).toBe("user")
  })

  test("drops oldest turns first", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      parts: [{ type: "text" as const, text: `turn ${i} ${"y".repeat(300)}` }],
    }))
    const budget = estimateTokens(systemPrompt(new Date())) + estimateTokens(history[0]!.parts[0]!.text) * 3 + 5
    const out = buildContext(history, budget)
    expect(out).toHaveLength(4)
    expect(out.at(-1)?.content).toContain("turn 9")
    expect(out[1]?.content).toContain("turn 7")
  })
})
