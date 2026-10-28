import { and, asc, desc, eq } from "drizzle-orm"
import type { Context } from "hono"
import { streamSSE } from "hono/streaming"
import { ulid } from "ulid"
import { z } from "zod"
import { ApiError, createApp, type AppEnv } from "../app"
import { attachmentParts, MAX_ATTACHMENTS, storeAttachment } from "../chat/attachments"
import { buildContext, type MessagePart } from "../chat/context"
import { assertChatQuota, loadPlan, recordChatUsage } from "../chat/quota"
import { CHAT_TOOLS, MAX_TOOL_ROUNDS, runTool, type FilePart } from "../chat/tools"
import { conversations, files, messages } from "../db/schema"
import { streamWithFallback, type ChatMessage, type ToolCall, type Usage } from "../llm/openrouter"
import { requireAuth } from "../middleware/auth"
import { chatModelsFor, MODEL_PRICING } from "../plans"

const CreateConversation = z.object({ title: z.string().trim().max(120).optional() })
const PatchConversation = z.object({ title: z.string().trim().min(1).max(120) })
const SendMessage = z.object({
  text: z.string().trim().max(32_000),
  fileIDs: z.array(z.string().min(1).max(40)).max(MAX_ATTACHMENTS).default([]),
})

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
  if (!body.text && body.fileIDs.length === 0) throw new ApiError(400, "INVALID_INPUT", "Tin nhắn trống")
  const conversation = await ownConversation(c, c.req.param("id"))
  const userParts: MessagePart[] = [
    ...(body.text ? [{ type: "text" as const, text: body.text }] : []),
    ...(await attachmentParts(c.get("db"), c.env.BUCKET, c.get("user").id, body.fileIDs)),
  ]
  return respond(c, conversation, userParts)
})

// Text-like attachments the next message can reference by id.
chat.post("/files", async (c) => {
  const form = await c.req.formData().catch(() => undefined)
  const file = form?.get("file") as unknown as File | string | null | undefined
  if (!file || typeof file === "string") throw new ApiError(400, "INVALID_INPUT", "Thiếu tệp")
  return c.json(await storeAttachment(c.get("db"), c.env.BUCKET, c.get("user").id, file))
})

chat.get("/files/:id", async (c) => {
  const row = await c
    .get("db")
    .select()
    .from(files)
    .where(and(eq(files.id, c.req.param("id")), eq(files.user_id, c.get("user").id)))
    .get()
  if (!row) throw new ApiError(404, "FILE_NOT_FOUND", "Không tìm thấy tệp")
  const object = await c.env.BUCKET.get(row.r2_key)
  if (!object) throw new ApiError(404, "FILE_NOT_FOUND", "Không tìm thấy tệp")
  const headers = new Headers()
  headers.set("content-type", row.mime)
  headers.set("content-length", String(row.size))
  headers.set("cache-control", "private, max-age=3600")
  headers.set(
    "content-disposition",
    `attachment; filename="${encodeURIComponent(row.name)}"; filename*=UTF-8''${encodeURIComponent(row.name)}`,
  )
  return new Response(object.body, { headers })
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
    const thread: ChatMessage[] = [...context]
    const fileParts: FilePart[] = []
    const usage: Usage = { input: 0, output: 0, cost: 0 }
    // Tools need a model that supports function calling; the free fallbacks do not.
    const tools = plan.id === "free" ? undefined : CHAT_TOOLS
    if (tools && thread[0]?.role === "system")
      thread[0] = { role: "system", content: `${thread[0].content}\n\n${TOOLS_HINT}` }
    let text = ""
    let failed = false
    let finishedModel = models[0]!
    await stream.writeSSE({ event: "start", data: JSON.stringify({ messageID: assistantID }) })

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const calls: ToolCall[] = []
      let roundText = ""
      let finished = false
      for await (const event of streamWithFallback(models, {
        apiKey,
        baseURL: c.env.OPENROUTER_BASE_URL,
        messages: thread,
        tools: round < MAX_TOOL_ROUNDS ? tools : undefined,
        maxTokens: 4096,
        signal: c.req.raw.signal,
      })) {
        if (event.type === "text-delta") {
          roundText += event.text
          text += event.text
          await stream.writeSSE({ event: "text-delta", data: JSON.stringify({ text: event.text }) })
          continue
        }
        if (event.type === "tool-call") {
          calls.push(event.call)
          continue
        }
        if (event.type === "provider-error") {
          failed = true
          console.error(`[chat] provider error ${event.status}: ${event.message}`)
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({
              message: friendlyProviderError(event.status, event.message, plan.id),
              status: event.status,
              detail: event.message.slice(0, 200),
            }),
          })
          break
        }
        if (event.type === "finish") {
          finished = true
          finishedModel = event.model
          usage.input += event.usage.input
          usage.output += event.usage.output
          usage.cost = (usage.cost ?? 0) + (event.usage.cost ?? priceOf(event.model, event.usage))
        }
      }
      if (failed || !finished || calls.length === 0) break

      thread.push({ role: "assistant", content: roundText || null, tool_calls: calls })
      for (const call of calls) {
        await stream.writeSSE({ event: "tool-call", data: JSON.stringify({ name: call.function.name }) })
        const result = await runTool(
          { db, bucket: c.env.BUCKET, userID: user.id, messageID: assistantID },
          call.function.name,
          call.function.arguments,
        )
        if (result.file) fileParts.push(result.file)
        thread.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result.output) })
        await stream.writeSSE({
          event: "tool-result",
          data: JSON.stringify({
            name: call.function.name,
            file: result.file ?? null,
            error: (result.output as { error?: string }).error ?? null,
          }),
        })
      }
      if (text) text += "\n\n"
    }

    if (failed) return
    if (!text && fileParts.length === 0) {
      await stream.writeSSE({ event: "error", data: JSON.stringify({ message: "Kiwii chưa trả lời được, thử lại" }) })
      return
    }
    const parts: MessagePart[] = [...(text ? [{ type: "text" as const, text: text.trim() }] : []), ...fileParts]
    const finishedAt = Date.now()
    await db.batch([
      db.insert(messages).values({
        id: assistantID,
        conversation_id: conversation.id,
        role: "assistant",
        parts: JSON.stringify(parts),
        model: finishedModel,
        input_tokens: usage.input,
        output_tokens: usage.output,
        cost_usd: usage.cost ?? 0,
        created_at: finishedAt,
      }),
      db.update(conversations).set({ last_message_at: finishedAt }).where(eq(conversations.id, conversation.id)),
    ])
    await recordChatUsage(db, {
      userID: user.id,
      inputTokens: usage.input,
      outputTokens: usage.output,
      costUsd: usage.cost ?? 0,
    })
    await stream.writeSSE({
      event: "finish",
      data: JSON.stringify({ messageID: assistantID, parts }),
    })
  })
}

const TOOLS_HINT =
  "Bạn có thể tạo tệp cho người dùng bằng các công cụ create_docx (Word), create_xlsx (Excel) và create_code_file (code hoặc văn bản). Khi người dùng muốn một tệp để tải về, hãy gọi công cụ với nội dung đầy đủ rồi trả lời ngắn gọn rằng tệp đã sẵn sàng; đừng chép lại toàn bộ nội dung tệp vào câu trả lời."

function priceOf(model: string, usage: Usage) {
  const price = MODEL_PRICING[model]
  return price ? (usage.input * price.input + usage.output * price.output) / 1_000_000 : 0
}

function friendlyProviderError(status: number, message: string, tier: string) {
  if (/data policy|privacy/i.test(message)) return "Dịch vụ AI đang gián đoạn, vui lòng báo quản trị viên"
  if (status === 429 && tier === "free") return "Hệ thống miễn phí đang quá tải, thử lại sau vài phút hoặc nâng gói"
  if (status === 429) return "Kiwii đang bận, thử lại sau ít giây"
  if (status === 401 || status === 402) return "Dịch vụ AI đang gián đoạn, vui lòng báo quản trị viên"
  return "Kiwii gặp lỗi, thử lại"
}
