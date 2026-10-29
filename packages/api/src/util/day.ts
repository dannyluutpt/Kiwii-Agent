const DAY_MS = 24 * 60 * 60 * 1000

// Calendar day in Asia/Ho_Chi_Minh (UTC+7, no DST) so daily limits reset at local midnight.
export function vietnamDay(now = Date.now()) {
  return new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function nextVietnamMidnight(now = Date.now()) {
  const shifted = now + 7 * 60 * 60 * 1000
  return Math.floor(shifted / DAY_MS) * DAY_MS + DAY_MS - 7 * 60 * 60 * 1000
}
