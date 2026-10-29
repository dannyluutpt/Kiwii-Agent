import { index, integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core"

export const Tier = ["free", "starter", "plus", "ultra"] as const
export type Tier = (typeof Tier)[number]

export const Timestamps = {
  created_at: integer()
    .notNull()
    .$default(() => Date.now()),
}

export const users = sqliteTable(
  "users",
  {
    id: text().primaryKey(),
    email: text().notNull(),
    password_hash: text().notNull(),
    password_salt: text().notNull(),
    password_iterations: integer().notNull(),
    tier: text({ enum: Tier }).notNull().default("free"),
    tier_until: integer(),
    locale: text().notNull().default("vi"),
    ...Timestamps,
  },
  (t) => [uniqueIndex("users_email").on(t.email)],
)

export const pending_signups = sqliteTable("pending_signups", {
  email: text().primaryKey(),
  password_hash: text().notNull(),
  password_salt: text().notNull(),
  password_iterations: integer().notNull(),
  otp_hash: text().notNull(),
  attempts: integer().notNull().default(0),
  expires_at: integer().notNull(),
  last_sent_at: integer().notNull(),
})

export const password_resets = sqliteTable("password_resets", {
  email: text().primaryKey(),
  otp_hash: text().notNull(),
  attempts: integer().notNull().default(0),
  expires_at: integer().notNull(),
  last_sent_at: integer().notNull(),
})

export const sessions = sqliteTable(
  "sessions",
  {
    token_hash: text().primaryKey(),
    user_id: text().notNull(),
    expires_at: integer().notNull(),
    ip: text(),
    user_agent: text(),
    ...Timestamps,
  },
  (t) => [index("sessions_user").on(t.user_id)],
)

// "attachment" and "generated" are files of the retired chat; their rows and objects remain.
export const FileKind = ["attachment", "generated", "reference", "image"] as const

export const files = sqliteTable(
  "files",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    r2_key: text().notNull(),
    name: text().notNull(),
    mime: text().notNull(),
    size: integer().notNull(),
    kind: text({ enum: FileKind }).notNull(),
    message_id: text(),
    generation_id: text(),
    ...Timestamps,
  },
  (t) => [index("files_user").on(t.user_id, t.created_at)],
)

export const plans = sqliteTable("plans", {
  id: text({ enum: Tier }).primaryKey(),
  name_vi: text().notNull(),
  name_en: text().notNull(),
  price_vnd: integer().notNull(),
  price_usd: real().notNull(),
  credits: integer().notNull(),
  // The chat_* columns of the retired chat stay in D1 and are left out here.
  parallel_limit: integer().notNull(),
  active: integer().notNull().default(1),
})

export const subscriptions = sqliteTable(
  "subscriptions",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    plan_id: text({ enum: Tier }).notNull(),
    period_start: integer().notNull(),
    period_end: integer().notNull(),
    status: text({ enum: ["active", "expired", "cancelled"] }).notNull(),
    order_id: text(),
    ...Timestamps,
  },
  (t) => [index("subscriptions_user").on(t.user_id, t.status)],
)

export const rate_limits = sqliteTable("rate_limits", {
  key: text().primaryKey(),
  window_start: integer().notNull(),
  count: integer().notNull(),
})

export const app_config = sqliteTable("app_config", {
  key: text().primaryKey(),
  value: text().notNull(),
  updated_at: integer().notNull(),
})

export const OrderKind = ["plan", "topup"] as const
export const OrderStatus = ["pending", "paid", "expired", "pending_review"] as const

export const plan_orders = sqliteTable(
  "plan_orders",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    kind: text({ enum: OrderKind }).notNull(),
    // plan id for kind=plan, top-up pack id for kind=topup
    item_id: text().notNull(),
    amount_vnd: integer().notNull(),
    // Short code the customer writes in the bank transfer memo; SePay echoes it back.
    memo: text().notNull(),
    status: text({ enum: OrderStatus }).notNull().default("pending"),
    expires_at: integer().notNull(),
    paid_at: integer(),
    bank_event_id: text(),
    ...Timestamps,
  },
  (t) => [uniqueIndex("plan_orders_memo").on(t.memo), index("plan_orders_user").on(t.user_id, t.status)],
)

export const bank_events = sqliteTable("bank_events", {
  // SePay transaction id; the primary key makes webhook retries idempotent.
  sepay_id: text().primaryKey(),
  order_id: text(),
  amount: integer().notNull(),
  content: text().notNull(),
  raw: text().notNull(),
  received_at: integer().notNull(),
})

export const plan_events = sqliteTable(
  "plan_events",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    type: text({ enum: ["activated", "renewed", "upgraded", "expired", "topup"] }).notNull(),
    order_id: text(),
    payload: text().notNull(),
    ...Timestamps,
  },
  (t) => [index("plan_events_user").on(t.user_id, t.created_at)],
)

export const GrantSource = ["plan", "topup", "bonus"] as const

export const credit_grants = sqliteTable(
  "credit_grants",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    source: text({ enum: GrantSource }).notNull(),
    amount: integer().notNull(),
    remaining: integer().notNull(),
    expires_at: integer().notNull(),
    ...Timestamps,
  },
  (t) => [index("credit_grants_user").on(t.user_id, t.expires_at)],
)

export const LedgerType = ["grant", "reserve", "settle", "refund", "expire"] as const

export const credit_ledger = sqliteTable(
  "credit_ledger",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    grant_id: text(),
    generation_id: text(),
    type: text({ enum: LedgerType }).notNull(),
    delta: integer().notNull(),
    balance_after: integer().notNull(),
    reason: text().notNull(),
    ...Timestamps,
  },
  (t) => [
    index("credit_ledger_user").on(t.user_id, t.created_at),
    index("credit_ledger_generation").on(t.generation_id),
  ],
)

export const GenerationStatus = ["running", "done", "failed"] as const

export const generations = sqliteTable(
  "generations",
  {
    id: text().primaryKey(),
    user_id: text().notNull(),
    status: text({ enum: GenerationStatus }).notNull(),
    // Our model id (see src/images/models.ts), not the OpenRouter slug.
    model: text().notNull(),
    // Resolution tier for FLUX / Nano Banana, quality for GPT.
    option: text().notNull(),
    aspect_ratio: text().notNull(),
    n: integer().notNull(),
    prompt_raw: text().notNull(),
    prompt_enhanced: text(),
    enhance: integer().notNull().default(1),
    // JSON array of files.id used as references.
    reference_file_ids: text().notNull().default("[]"),
    credits_reserved: integer().notNull(),
    credits_final: integer(),
    cost_usd: real(),
    error: text(),
    finished_at: integer(),
    ...Timestamps,
  },
  (t) => [
    index("generations_user").on(t.user_id, t.created_at),
    index("generations_status").on(t.status, t.created_at),
  ],
)

export const generation_images = sqliteTable(
  "generation_images",
  {
    id: text().primaryKey(),
    generation_id: text().notNull(),
    user_id: text().notNull(),
    file_id: text().notNull(),
    position: integer().notNull(),
    ...Timestamps,
  },
  (t) => [
    index("generation_images_generation").on(t.generation_id),
    index("generation_images_user").on(t.user_id, t.created_at),
  ],
)
