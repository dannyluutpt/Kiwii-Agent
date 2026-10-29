export type DateGroup = "today" | "yesterday" | "week" | "month" | "older"

const DAY = 86_400_000
const ORDER: DateGroup[] = ["today", "yesterday", "week", "month", "older"]

// Buckets a timestamp relative to local midnight, like the history list in most apps.
export function dateGroup(time: number, now: number): DateGroup {
  const midnight = new Date(now).setHours(0, 0, 0, 0)
  if (time >= midnight) return "today"
  if (time >= midnight - DAY) return "yesterday"
  if (time >= midnight - 7 * DAY) return "week"
  if (time >= midnight - 30 * DAY) return "month"
  return "older"
}

// Non-empty groups in display order; items keep their incoming (most recent first) order.
export function groupByDate<T extends { updatedAt: number }>(items: T[], now: number) {
  return ORDER.map((group) => ({
    group,
    items: items.filter((item) => dateGroup(item.updatedAt, now) === group),
  })).filter((entry) => entry.items.length > 0)
}

// Lowercase without Vietnamese tone and vowel marks, so "da lat" finds "Đà Lạt".
export function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
}
