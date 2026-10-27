import { and, asc, desc, eq } from "drizzle-orm"
import type { Context } from "hono"
import { streamSSE } from "hono/streaming"
import { ulid } from "ulid"
import { z } from "zod"
import { ApiError, createApp, type AppEnv } from "../app"
import { buildContext, type MessagePart } from "../chat/context"
import { assertChatQuota, loadPlan, recordChatUsage } from "../chat/quota"
import { conversations, messages } from "../db/schema"
import { streamWithFallback } from "../llm/openrouter"
import { requireAuth } from "../middleware/auth"
import { chatModelsFor, MODEL_PRICING } from "../plans"

const CreateConversation = z.object({ title: z.string().trim().max(120).optional() })
const PatchConversation = z.object({ title: z.string().trim().min(1).max(120) })
const SendMessage = z.object({ text: z.string().trim().min(1).max(32_000) })

export const chat = createApp()

chat.use("*", requireAuth)

chat.get("/conversations", async (c) => {
  const rows = await c
    .get("db")
    .select({
      id: conversations.id,
      title: conversations.title,
      lastMessageAt: conversations.last_message_at,
    })
    .from(conversations)
    .where(and(eq(conversations.user_id, c.get("user").id), eq(conversations.archived, 0)))
    .orderBy(desc(conversations.last_message_at))
    .limit(200)
  return c.json({ conversations: rows })
})

chat.post("/conversations", async (c) => {
  const body = CreateConversation.parse(await c.req.json().catch(() => ({})))
  const user = c.get("user")
  const plan = await loadPlan(c.get("db"), user)
  const id = ulid()
  const now = Date.now()
  await c
    .get("db")
    .insert(conversations)
    .values({
      id,
      user_id: user.id,
      title: body.title || "Hội thoại mới",
      model: chatModelsFor(plan.id)[0]!,
      last_message_at: now,
    })
  return c.json({ id, title: body.title || "Hội thoại mới", lastMessageAt: now })
})

chat.patch("/conversations/:id", async (c) => {
  const body = PatchConversation.parse(await c.req.json())
  const conversation = await ownConversation(c, c.req.param("id"))
  await c.get("db").update(conversations).set({ title: body.title }).where(eq(conversations.id, conversation.id))
  return c.json({ ok: true })
})

chat.delete("/conversations/:id", async (c) => {
  const conversation = await ownConversation(c, c.req.param("id"))
  await c
    .get("db")
    .batch([
      c.get("db").delete(messages).where(eq(messages.conversation_id, conversation.id)),
      c.get("db").delete(conversations).where(eq(conversations.id, conversation.id)),
    ])
  return c.json({ ok: true })
})

chat.get("/conversations/:id/messages", async (c) => {
  const conversation = await ownConversation(c, c.req.param("id"))
  const rows = await c
    .get("db")
    .select({ id: messages.id, role: messages.role, parts: messages.parts, createdAt: messages.created_at })
    .from(messages)
    .where(eq(messages.conversation_id, conversation.id))
    .orderBy(asc(messages.created_at))
  return c.json({
    conversation: { id: conversation.id, title: conversation.title },
    messages: rows.map((row) => ({ ...row, parts: JSON.parse(row.parts) as MessagePart[] })),
  })
})

chat.post("/conversations/:id/messages", async (c) => {
  const body = SendMessage.parse(await c.req.json())
  const conversation = await ownConversation(c, c.req.param("id"))
  const userParts: MessagePart[] = [{ type: "text", text: body.text }]
  return respond(c, conversation, userParts)
})

chat.post("/conversations/:id/regenerate", async (c) => {
  const conversation = await ownConversation(c, c.req.param("id"))
  const last = await c
    .get("db")
    .select()
    .from(messages)
    .where(eq(messages.conversation_id, conversation.id))
    .orderBy(desc(messages.created_at))
    .limit(1)
    .get()
  if (last?.role === "assistant") await c.get("db").delete(messages).where(eq(messages.id, last.id))
  return respond(c, conversation, undefined)
})

type Ctx = Context<AppEnv>

async function ownConversation(c: Ctx, id: string) {
  const row = await c
    .get("db")
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.user_id, c.get("user").id)))
    .get()
  if (!row) throw new ApiError(404, "CONVERSATION_NOT_FOUND", "Không tìm thấy hội thoại")
  return row
}

// Streams the assistant reply as SSE. `userParts` is undefined on regenerate, where the latest
// stored user message is reused instead of inserting a new one.
async function respond(c: Ctx, conversation: typeof conversations.$inferSelect, userParts: MessagePart[] | undefined) {
  const db = c.get("db")
  const user = c.get("user")
  const apiKey = c.env.OPENROUTER_API_KEY
  if (!apiKey) throw new ApiError(500, "LLM_NOT_CONFIGURED", "Thiếu OPENROUTER_API_KEY")
  const plan = await loadPlan(db, user)
  await assertChatQuota(db, user, plan)

  const now = Date.now()
  if (userParts) {
    await db.batch([
      db.insert(messages).values({
        id: ulid(),
        conversation_id: conversation.id,
        role: "user",
        parts: JSON.stringify(userParts),
        created_at: now,
      }),
      db.update(conversations).set({ last_message_at: now }).where(eq(conversations.id, conversation.id)),
    ])
  }
  const history = await db
    .select({ role: messages.role, parts: messages.parts })
    .from(messages)
    .where(eq(messages.conversation_id, conversation.id))
    .orderBy(asc(messages.created_at))
  if (history.length === 0) throw new ApiError(400, "EMPTY_CONVERSATION", "Chưa có tin nhắn để trả lời")
  const context = buildContext(
    history.map((row) => ({ role: row.role, parts: JSON.parse(row.parts) as MessagePart[] })),
    plan.chat_context_tokens,
  )
  const models = chatModelsFor(plan.id)

  return streamSSE(c, async (stream) => {
    const assistantID = ulid()
    let text = ""
    let failed = false
    await stream.writeSSE({ event: "start", data: JSON.stringify({ messageID: assistantID }) })
    for await (const event of streamWithFallback(models, {
      apiKey,
      baseURL: c.env.OPENROUTER_BASE_URL,
      messages: context,
      maxTokens: 4096,
      signal: c.req.raw.signal,
    })) {
      if (event.type === "text-delta") {
        text += event.text
        await stream.writeSSE({ event: "text-delta", data: JSON.stringify({ text: event.text }) })
        continue
      }
      if (event.type === "provider-error") {
        failed = true
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ message: friendlyProviderError(event.status, plan.id) }),
        })
        continue
      }
      if (event.type === "finish") {
        const price = MODEL_PRICING[event.model]
        const cost = price ? (event.usage.input * price.input + event.usage.output * price.output) / 1_000_000 : 0
        const finishedAt = Date.now()
        await db.batch([
          db.insert(messages).values({
            id: assistantID,
            conversation_id: conversation.id,
            role: "assistant",
            parts: JSON.stringify([{ type: "text", text }] satisfies MessagePart[]),
            model: event.model,
            input_tokens: event.usage.input,
            output_tokens: event.usage.output,
            cost_usd: event.usage.cost ?? cost,
            created_at: finishedAt,
          }),
          db.update(conversations).set({ last_message_at: finishedAt }).where(eq(conversations.id, conversation.id)),
        ])
        await recordChatUsage(db, {
          userID: user.id,
          inputTokens: event.usage.input,
          outputTokens: event.usage.output,
          costUsd: event.usage.cost ?? cost,
        })
        await stream.writeSSE({
          event: "finish",
          data: JSON.stringify({ messageID: assistantID, model: event.model, usage: event.usage }),
        })
      }
    }
    if (!failed && !text) {
      await stream.writeSSE({ event: "error", data: JSON.stringify({ message: "Model không trả lời, thử lại" }) })
    }
  })
}

function friendlyProviderError(status: number, tier: string) {
  if (status === 429 && tier === "free") return "Hệ thống miễn phí đang quá tải, thử lại sau vài phút hoặc nâng gói"
  if (status === 429) return "Model đang bận, thử lại sau ít giây"
  if (status === 401 || status === 402) return "Dịch vụ AI đang gián đoạn, vui lòng báo quản trị viên"
  return "Model gặp lỗi, thử lại"
}
