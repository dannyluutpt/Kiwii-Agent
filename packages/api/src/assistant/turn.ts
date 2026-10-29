import { and, desc, eq, inArray } from "drizzle-orm"
import { ulid } from "ulid"
import { z } from "zod"
import { ApiError, type User } from "../app"
import { balance } from "../credits/ledger"
import type { Database } from "../db/client"
import { generation_images, generations, project_messages } from "../db/schema"
import { runGeneration, type GenerationEvent } from "../images/generate"
import { imageCreditCost, ImageModelID, loadImageModels, MAX_IMAGES_PER_RUN, MAX_REFERENCES } from "../images/models"
import { accessAllows, CreateGeneration, imageAccess, prepareGeneration } from "../images/prepare"
import { presentGeneration } from "../images/present"
import { ASSISTANT_MODEL } from "../llm/models"
import { streamChat, type ChatMessage, type ToolCall } from "../llm/openrouter"
import { consumeWindow } from "../middleware/ratelimit"
import { loadPlan } from "../plans"
import { touchProject, type Project } from "../projects/store"
import { vietnamDay } from "../util/day"
import { generateTool, historyMessages, systemPrompt, type Picture } from "./context"
import { presentMessage, type MessagePart } from "./parts"

// Model rounds per message: ask, run the tools, ask again. The last round offers no tool, so the
// assistant always ends with words.
export const MAX_ROUNDS = 3
// Pictures one message may start in all, whatever the model asks for.
export const MAX_PICTURES = 4
// Messages a day, counted from Vietnamese midnight. Messages cost no credit; pictures do.
export const DAILY_MESSAGES = { paid: 300, trial: 30 }
const RECENT_RUNS = 8
const HISTORY = 10

export const AssistantRequest = z.object({
  text: z.string().trim().min(1).max(4000),
  settings: z.object({
    model: z.enum(ImageModelID),
    option: z.string().min(1).max(10),
    aspectRatio: z.string().regex(/^\d+(\.\d+)?:\d+(\.\d+)?$/),
    n: z.number().int().min(1).max(MAX_IMAGES_PER_RUN),
  }),
  referenceFileIDs: z.array(z.string().min(1).max(40)).max(MAX_REFERENCES).default([]),
})

const GenerateArgs = z.object({
  // The model sometimes leaves its own tool-call markup around the value: "<parameter=prompt>…</parameter>".
  prompt: z
    .string()
    .transform((text) => text.replace(/<\/?parameter[^>]*>/gi, "").trim())
    .pipe(z.string().min(1).max(4000)),
  reference_images: z.array(z.string()).max(MAX_REFERENCES).optional(),
  aspect_ratio: z.string().optional(),
  count: z.number().int().min(1).optional(),
})

export type AssistantEvent =
  | { type: "start"; messageID: string; userMessageID: string }
  | { type: "text-delta"; text: string }
  | { type: "generation-start"; generation: ReturnType<typeof presentGeneration> }
  | { type: "generation-partial"; id: string; index: number; b64: string }
  | { type: "generation-image"; id: string; index: number; imageID: string; fileID: string }
  | { type: "generation-done"; id: string; creditsFinal: number; refunded: number }
  | { type: "generation-error"; id: string; message: string; refunded: number }
  | { type: "notice"; code: string; message: string }
  | { type: "error"; message: string }
  | { type: "finish"; message: ReturnType<typeof presentMessage> }

// Before the assistant is asked anything: the account may make pictures with these settings, holds
// credit for one run of them, and has messages left today. Nothing is charged here.
export async function checkAssistant(db: Database, user: User, request: z.infer<typeof AssistantRequest>) {
  const plan = await loadPlan(db, user)
  const credits = await balance(db, user.id)
  const access = imageAccess(plan.parallel_limit, credits)
  if (access.parallelLimit === 0) {
    throw new ApiError(403, "IMAGE_REQUIRES_PAID", "Tạo ảnh dành cho gói trả phí. Hãy nâng cấp gói.")
  }
  if (!accessAllows(access, request.settings.model, request.settings.option)) {
    throw new ApiError(403, "IMAGE_REQUIRES_PAID", "Dùng thử chỉ tạo được ảnh FLUX 3 Klein 1K. Hãy nâng cấp gói.")
  }
  const cost = imageCreditCost(await loadImageModels(db), {
    model: request.settings.model,
    option: request.settings.option,
    n: request.settings.n,
    references: request.referenceFileIDs.length,
  })
  if (cost === undefined) throw new ApiError(400, "INVALID_INPUT", "Cài đặt không hợp lệ")
  if (credits < cost) throw new ApiError(402, "INSUFFICIENT_CREDITS", "Không đủ credit, hãy nâng gói hoặc mua thêm")
  const limit = access.trial ? DAILY_MESSAGES.trial : DAILY_MESSAGES.paid
  const window = await consumeWindow(db, {
    key: `assistant:${user.id}:${vietnamDay()}`,
    limit,
    windowMs: 24 * 60 * 60 * 1000,
  })
  if (!window.allowed) {
    throw new ApiError(
      429,
      "ASSISTANT_LIMIT",
      `Bạn đã gửi ${limit} tin nhắn cho trợ lý hôm nay. Hãy quay lại vào ngày mai.`,
    )
  }
  return access
}

// One message to the assistant and everything it leads to: the person's turn is stored, the model
// answers and may start runs through generate_image (screened and charged like any other run), the
// runs render while it replies, and the reply is stored with the runs and what the model cost.
export async function runAssistantTurn(input: {
  db: Database
  bucket: R2Bucket
  apiKey: string
  baseURL?: string
  user: User
  project: Project
  parallel: number
  request: z.infer<typeof AssistantRequest>
  emit: (event: AssistantEvent) => Promise<void> | void
}) {
  const db = input.db
  const body = input.request
  const now = Date.now()
  const userMessageID = ulid()
  const messageID = ulid()
  const userParts: MessagePart[] = [
    { type: "text", text: body.text },
    ...body.referenceFileIDs.map((fileID): MessagePart => ({ type: "image", fileID })),
  ]
  await db.insert(project_messages).values({
    id: userMessageID,
    project_id: input.project.id,
    user_id: input.user.id,
    role: "user",
    parts: JSON.stringify(userParts),
    created_at: now,
  })
  // An unnamed project takes its name from the person's words, not from a prompt the model wrote.
  await touchProject(db, input.project, body.text, now)
  await input.emit({ type: "start", messageID, userMessageID })

  const runs = await db
    .select()
    .from(generations)
    .where(and(eq(generations.user_id, input.user.id), eq(generations.project_id, input.project.id)))
    .orderBy(desc(generations.id))
    .limit(RECENT_RUNS)
  const images = runs.length
    ? await db
        .select()
        .from(generation_images)
        .where(
          inArray(
            generation_images.generation_id,
            runs.map((run) => run.id),
          ),
        )
        .orderBy(generation_images.position)
    : []
  const pictures: Picture[] = runs
    .flatMap((run) =>
      images
        .filter((image) => image.generation_id === run.id)
        .map((image) => ({ fileID: image.file_id, prompt: run.prompt_raw, position: image.position, n: run.n })),
    )
    .map((picture, index) => ({ ...picture, label: `#${index + 1}` }))
  const attached = body.referenceFileIDs.map((fileID, index) => ({ label: `R${index + 1}`, fileID }))
  const labels = new Map([...pictures, ...attached].map((p) => [p.label.toUpperCase(), p.fileID]))

  const history = (
    await db
      .select()
      .from(project_messages)
      .where(eq(project_messages.project_id, input.project.id))
      .orderBy(desc(project_messages.created_at), desc(project_messages.id))
      .limit(HISTORY)
  )
    .reverse()
    .map(presentMessage)
  const mentioned = history.flatMap((m) => m.parts.flatMap((part) => (part.type === "generation" ? [part.id] : [])))
  const earlier = new Map(
    (mentioned.length
      ? await db
          .select({ id: generations.id, prompt: generations.prompt_raw, n: generations.n })
          .from(generations)
          .where(inArray(generations.id, mentioned))
      : []
    ).map((row) => [row.id, { prompt: row.prompt, n: row.n }]),
  )

  const model = (await loadImageModels(db)).find((m) => m.id === body.settings.model)!
  const option = model.options.find((o) => o.id === body.settings.option)
  const thread: ChatMessage[] = [
    {
      role: "system",
      content: systemPrompt({
        model,
        option: option?.label_en ?? body.settings.option,
        aspectRatio: body.settings.aspectRatio,
        n: body.settings.n,
        parallel: input.parallel,
        maxPictures: MAX_PICTURES,
        pictures,
        attached: attached.map((a) => a.label),
      }),
    },
    ...historyMessages(history, earlier),
  ]
  const tool = generateTool(model, MAX_PICTURES)
  // A frame the person named ("bản dọc 9:16") holds even when the model only wrote it into the prompt.
  const named = [...body.text.matchAll(/(\d{1,2})\s*:\s*(\d{1,2})/g)]
    .map((match) => `${match[1]}:${match[2]}`)
    .filter((ratio) => model.aspectRatios.includes(ratio))
    .at(-1)
  const parts: MessagePart[] = []
  const jobs: Promise<void>[] = []
  const usage = { input: 0, output: 0, cost: 0 }
  let text = ""
  let requested = 0
  let replied = ASSISTANT_MODEL
  let failed = false
  const refusals: string[] = []
  const refuse = (error: string) => {
    refusals.push(error)
    return { error }
  }

  // One generate_image call: the run starts (or is refused, and the model hears why, with what it can
  // do instead) and renders in the background while the model goes on.
  const start = async (call: ToolCall) => {
    const args = GenerateArgs.safeParse(parseArguments(call.function.arguments))
    if (call.function.name !== "generate_image" || !args.success)
      return refuse('Call generate_image with JSON arguments such as {"prompt": "…"}')
    const count = Math.min(args.data.count ?? body.settings.n, MAX_IMAGES_PER_RUN, MAX_PICTURES - requested)
    if (count < 1) return refuse(`At most ${MAX_PICTURES} pictures per message`)
    const unknown = (args.data.reference_images ?? []).filter((label) => !labels.has(label.trim().toUpperCase()))
    if (unknown.length)
      return refuse(
        `Unknown picture label ${unknown.join(", ")}. Labels you can use: ${[...labels.keys()].join(", ") || "none"}`,
      )
    const references = (args.data.reference_images ?? []).map((label) => labels.get(label.trim().toUpperCase()))
    const aspectRatio =
      [args.data.aspect_ratio, named].find((ratio) => ratio && model.aspectRatios.includes(ratio)) ??
      body.settings.aspectRatio
    const prepared = await prepareGeneration({
      db,
      bucket: input.bucket,
      apiKey: input.apiKey,
      baseURL: input.baseURL,
      user: input.user,
      request: CreateGeneration.parse({
        model: body.settings.model,
        option: body.settings.option,
        aspectRatio,
        n: count,
        prompt: args.data.prompt,
        referenceFileIDs: references,
        projectID: input.project.id,
      }),
    }).catch((error: unknown) => {
      if (error instanceof ApiError) return error
      throw error
    })
    if (prepared instanceof ApiError) {
      parts.push({ type: "notice", code: prepared.code, message: prepared.message })
      await input.emit({ type: "notice", code: prepared.code, message: prepared.message })
      return { error: prepared.message }
    }
    requested += count
    const id = prepared.generation.id
    parts.push({ type: "generation", id })
    await input.emit({ type: "generation-start", generation: presentGeneration(prepared.generation, []) })
    jobs.push(
      runGeneration({
        ...prepared,
        db,
        bucket: input.bucket,
        apiKey: input.apiKey,
        baseURL: input.baseURL,
        emit: (event) => input.emit(relay(id, event)),
      }),
    )
    return { status: "started", pictures: count }
  }

  for (const round of Array.from({ length: MAX_ROUNDS }, (_, index) => index)) {
    const calls: ToolCall[] = []
    let said = ""
    let finished = false
    for await (const event of streamChat({
      apiKey: input.apiKey,
      baseURL: input.baseURL,
      model: ASSISTANT_MODEL,
      messages: thread,
      tools: round < MAX_ROUNDS - 1 ? [tool] : undefined,
      maxTokens: 1500,
    })) {
      if (event.type === "text-delta") {
        said += event.text
        await input.emit({ type: "text-delta", text: event.text })
      }
      if (event.type === "tool-call") calls.push(event.call)
      if (event.type === "provider-error") {
        console.error(`[assistant] provider error ${event.status}: ${event.message}`)
        failed = true
        break
      }
      if (event.type === "finish") {
        finished = true
        replied = event.model
        usage.input += event.usage.input
        usage.output += event.usage.output
        usage.cost += event.usage.cost ?? 0
      }
    }
    text += said
    // The last round offers no tool: a call the model makes anyway is not carried out.
    if (failed || !finished || calls.length === 0 || round === MAX_ROUNDS - 1) break
    thread.push({ role: "assistant", content: said || null, tool_calls: calls })
    for (const call of calls) {
      thread.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(await start(call)) })
    }
    // Words from separate rounds read as separate sentences.
    if (said && !/\s$/.test(said)) {
      text += " "
      await input.emit({ type: "text-delta", text: " " })
    }
  }

  await Promise.all(jobs)
  const reply = text.trim()
  if (!reply && parts.length === 0) {
    console.error(`[assistant] no reply (${failed ? "provider error" : `refused: ${refusals.join(" | ") || "none"}`})`)
    await input.emit({ type: "error", message: "Trợ lý chưa trả lời được, hãy thử lại" })
    return
  }
  const row = {
    id: messageID,
    project_id: input.project.id,
    user_id: input.user.id,
    role: "assistant" as const,
    parts: JSON.stringify([...(reply ? [{ type: "text", text: reply }] : []), ...parts]),
    model: replied,
    input_tokens: usage.input,
    output_tokens: usage.output,
    cost_usd: usage.cost,
    created_at: Date.now(),
  }
  await db.insert(project_messages).values(row)
  await input.emit({ type: "finish", message: presentMessage(row) })
}

function parseArguments(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function relay(id: string, event: GenerationEvent): AssistantEvent {
  if (event.type === "partial") return { type: "generation-partial", id, index: event.index, b64: event.b64 }
  if (event.type === "image")
    return { type: "generation-image", id, index: event.index, imageID: event.id, fileID: event.fileID }
  if (event.type === "done")
    return { type: "generation-done", id, creditsFinal: event.creditsFinal, refunded: event.refunded }
  return { type: "generation-error", id, message: event.message, refunded: event.refunded }
}
