import { ApiError } from "@/api"

// Server errors already carry a Vietnamese message; anything else is a dropped connection.
export function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback
}
