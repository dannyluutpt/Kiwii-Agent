import { describe, expect, test } from "bun:test"
import { buildContext, estimateTokens, SYSTEM_PROMPT } from "../src/chat/context"

describe("buildContext", () => {
  test("keeps system prompt and newest message even over budget", () => {
    const out = buildContext([{ role: "user", parts: [{ type: "text", text: "x".repeat(10_000) }] }], 100)
    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({ role: "system", content: SYSTEM_PROMPT })
    expect(out[1]?.role).toBe("user")
  })

  test("drops oldest turns first", () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
      parts: [{ type: "text" as const, text: `turn ${i} ${"y".repeat(300)}` }],
    }))
    const budget = estimateTokens(SYSTEM_PROMPT) + estimateTokens(history[0]!.parts[0]!.text) * 3 + 5
    const out = buildContext(history, budget)
    expect(out).toHaveLength(4)
    expect(out.at(-1)?.content).toContain("turn 9")
    expect(out[1]?.content).toContain("turn 7")
  })
})
