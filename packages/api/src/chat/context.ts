import type { ChatMessage } from "../llm/openrouter"

export type MessagePart =
  | { type: "text"; text: string }
  | { type: "file"; file_id: string; name: string; mime: string; size: number; text?: string }
  | { type: "tool"; name: string; input: unknown; output: unknown }

export const SYSTEM_PROMPT = `Bạn là Kiwii, trợ lý AI thân thiện và chính xác. Trả lời bằng ngôn ngữ người dùng đang dùng (mặc định tiếng Việt có đầy đủ dấu). Dùng Markdown khi hữu ích: tiêu đề ngắn, danh sách, bảng, khối code có tên ngôn ngữ. Trình bày gọn, đi thẳng vào việc, không lặp lại câu hỏi. Khi không chắc, nói rõ điều chưa chắc thay vì bịa.`

// Rough token estimate; good enough for trimming history without a tokenizer in the Worker.
export function estimateTokens(text: string) {
  return Math.ceil(text.length / 3.5)
}

export function partsToText(parts: MessagePart[]) {
  return parts
    .map((part) => {
      if (part.type === "text") return part.text
      if (part.type === "file") return part.text ? `[Tệp ${part.name}]\n${part.text}` : `[Tệp đính kèm: ${part.name}]`
      return ""
    })
    .filter(Boolean)
    .join("\n\n")
}

// Keeps the system prompt and the newest message, then adds older turns until the budget is spent.
export function buildContext(
  history: Array<{ role: "user" | "assistant"; parts: MessagePart[] }>,
  budgetTokens: number,
): ChatMessage[] {
  const system: ChatMessage = { role: "system", content: SYSTEM_PROMPT }
  let remaining = budgetTokens - estimateTokens(SYSTEM_PROMPT)
  const picked: ChatMessage[] = []
  for (const message of [...history].reverse()) {
    const content = partsToText(message.parts)
    const cost = estimateTokens(content)
    if (picked.length > 0 && cost > remaining) break
    remaining -= cost
    picked.push({ role: message.role, content })
  }
  return [system, ...picked.reverse()]
}
