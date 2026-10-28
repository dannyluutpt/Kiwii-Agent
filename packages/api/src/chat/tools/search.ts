import { z } from "zod"
import { DEFAULT_BASE_URL } from "../../llm/openrouter"
import { PAID_CHAT_MODEL } from "../../plans"

const Input = z.object({ query: z.string().min(1).max(300) })

export type SearchResult = { title: string; url: string; excerpt: string }
export type SearchOutput = { summary: string; results: SearchResult[]; costUsd: number }

type Completion = {
  choices?: Array<{
    message?: {
      content?: string | null
      annotations?: Array<{
        type?: string
        url_citation?: { url?: string; title?: string; content?: string }
      }>
    }
  }>
  usage?: { cost?: number }
}

// Searches the web through OpenRouter's web plugin: one buffered call on the chat model with the
// plugin attached, which returns a short answer plus the pages it drew on as url_citation
// annotations. Exa "fast" costs about $0.007 a search on top of the tokens.
export async function searchWeb(
  raw: unknown,
  input: { apiKey: string; baseURL?: string; now: Date },
): Promise<SearchOutput> {
  const { query } = Input.parse(raw)
  const res = await fetch(`${input.baseURL ?? DEFAULT_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: PAID_CHAT_MODEL,
      messages: [
        {
          role: "system",
          content: `Today is ${input.now.toISOString().slice(0, 10)}. Using the web results provided, answer the query in 3 to 6 sentences in the query's language, with concrete facts, names, numbers and dates. No preamble, no list of sources: they are returned separately.`,
        },
        { role: "user", content: query },
      ],
      plugins: [{ id: "web", engine: "exa", mode: "fast", max_results: 6 }],
      max_tokens: 600,
      temperature: 0.2,
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`search failed with ${res.status}`)
  const body = (await res.json()) as Completion
  const message = body.choices?.[0]?.message
  const seen = new Set<string>()
  const results: SearchResult[] = []
  for (const note of message?.annotations ?? []) {
    const cite = note.url_citation
    if (note.type !== "url_citation" || !cite?.url || seen.has(cite.url)) continue
    seen.add(cite.url)
    results.push({ title: cite.title ?? cite.url, url: cite.url, excerpt: (cite.content ?? "").slice(0, 400) })
  }
  return { summary: (message?.content ?? "").trim(), results, costUsd: body.usage?.cost ?? 0 }
}
