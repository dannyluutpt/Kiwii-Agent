import { ApiError } from "@/api"

// The server words its errors in Vietnamese. In English the person reads these instead, by the error's
// code; a code not listed here (a prompt the screening refused, with its own reason) keeps the server's
// words, which beats saying nothing.
const ENGLISH: Record<string, string | ((extra: Record<string, unknown>) => string)> = {
  BAD_CREDENTIALS: "Wrong email or password",
  CHARACTER_LIMIT: "You have saved as many characters as an account can hold",
  CHARACTER_NOT_FOUND: "Character not found",
  EMAIL_TAKEN: "This email is already registered",
  FILE_NOT_FOUND: "Picture not found",
  FILE_TOO_LARGE: "Pictures can be 10 MB at most",
  GENERATION_NOT_FOUND: "Run not found",
  GENERATION_RUNNING: "This run is still going",
  IMAGE_REQUIRES_PAID: "This needs a paid plan. Upgrade to continue.",
  INSUFFICIENT_CREDITS: "Not enough credits. Upgrade your plan or buy more.",
  INVALID_ASPECT: "This frame is not available for the model",
  INVALID_INPUT: "The request is not valid",
  INVALID_OPTION: "This option is not available for the model",
  LAST_FRAME_NEEDS_FIRST: "Add a first frame before the last frame",
  LOCATION_LIMIT: "You have saved as many locations as an account can hold",
  LOCATION_NOT_FOUND: "Location not found",
  NOT_A_PICTURE: "Only pictures can be saved",
  ORDER_NOT_FOUND: "Order not found",
  OTP_DAILY_LIMIT: "This email has received too many codes today",
  OTP_EXPIRED: "The code has expired. Ask for a new one.",
  OTP_INVALID: "Wrong code",
  OTP_LOCKED: "Too many wrong tries. Ask for a new code.",
  OTP_TOO_SOON: "Wait a minute before asking for another code",
  PARALLEL_LIMIT: (extra) => `Your plan runs ${String(extra.limit ?? "a few")} at a time. Wait for one to finish.`,
  PLAN_NOT_FOUND: "Plan not found",
  PROJECT_NOT_FOUND: "Project not found",
  RATE_LIMITED: "Too many requests. Try again in a minute.",
  SCREENING_UNAVAILABLE: "Could not check the prompt just now. Try again shortly.",
  SHEET_NOT_FOUND: "Character sheet not found",
  SHEET_REQUIRES_PAID: "Creating a character from a description needs a paid plan",
  SIGNUP_NOT_FOUND: "No sign-up is waiting for this email. Sign up again.",
  TOPUP_NEEDS_PLAN: "Buying extra credits needs an active paid plan",
  TURNSTILE_FAILED: "The robot check failed. Try again.",
  TURNSTILE_REQUIRED: "Confirm you are not a robot",
  UNAUTHENTICATED: "Sign in to continue",
  UNSUPPORTED_TYPE: "Only JPEG, PNG or WebP pictures",
  VIDEO_FAILED: "The clip could not be made. Your credits were returned.",
  VIDEO_REQUIRES_PAID: "Video needs a paid plan. Upgrade to continue.",
  WEAK_PASSWORD: "The password must have 8 to 128 characters",
  INTERNAL: "Something went wrong on our side",
}

// What to tell the person about a failed request: the server's reason, in their language, or
// `fallback` when the request never got an answer (a dropped connection).
export function errorMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) return fallback
  if (document.documentElement.lang !== "en") return error.message
  const english = ENGLISH[error.code]
  if (!english) return error.message
  return typeof english === "string" ? english : english(error.extra)
}
