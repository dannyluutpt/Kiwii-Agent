const KEY = "amberpix-ref"

// The code in an invitation link (/?ref=CODE), kept until the visitor signs up, however many pages or
// days later. The first code seen stays: a second link does not take an invitation over.
export function rememberReferral(search: string) {
  const code = new URLSearchParams(search).get("ref")?.trim().toUpperCase()
  if (!code || !/^[A-Z2-9]{8}$/.test(code)) return
  try {
    if (!localStorage.getItem(KEY)) localStorage.setItem(KEY, code)
  } catch {}
}

export function referral() {
  try {
    return localStorage.getItem(KEY) ?? undefined
  } catch {
    return undefined
  }
}
