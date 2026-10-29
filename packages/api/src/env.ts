import type { VideoParams } from "./videos/run"

export type Env = {
  DB: D1Database
  BUCKET: R2Bucket
  // Cloudflare Images, for small copies of pictures; absent where it is not bound (tests).
  IMAGES?: ImagesBinding
  // Waits on video jobs; see src/videos/workflow.ts.
  VIDEO_WORKFLOW?: Workflow<VideoParams>
  // Seconds between looks at a video job; 15 unless set (the local mock answers in a few).
  VIDEO_POLL_SECONDS?: string
  ASSETS: Fetcher
  EMAIL?: SendEmail
  RL_IP: RateLimit
  RL_AUTH: RateLimit
  APP_URL: string
  EMAIL_FROM: string
  SEPAY_BANK_CODE?: string
  SEPAY_BANK_ACCOUNT?: string
  SEPAY_ACCOUNT_NAME?: string
  TURNSTILE_SITE_KEY?: string
  OPENROUTER_API_KEY?: string
  OPENROUTER_BASE_URL?: string
  SEPAY_API_KEY?: string
  TURNSTILE_SECRET_KEY?: string
  LOG_EMAIL?: string
}

// Cloudflare Email Service binding. The workers-types package does not ship this shape yet.
export type SendEmail = {
  send(message: {
    from: string
    to: string
    subject: string
    text: string
    html?: string
  }): Promise<{ messageId?: string }>
}

export type RateLimit = {
  limit(options: { key: string }): Promise<{ success: boolean }>
}
