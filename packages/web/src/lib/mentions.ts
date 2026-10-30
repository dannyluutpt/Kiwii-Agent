// "@" tags in the prompt: typing "@" and part of a name lists the saved characters and locations to
// pick, and picking one writes its name in place of the tag.

// The "@…" being typed right before the caret: an @ at the start or after a space, then up to the
// caret on the same line. Anything else (an email, an @ inside a word) is no tag.
export function mentionAt(text: string, caret: number) {
  const before = text.slice(0, caret)
  const start = before.lastIndexOf("@")
  if (start < 0 || (start > 0 && !/\s/.test(before[start - 1] ?? ""))) return undefined
  const query = before.slice(start + 1)
  if (query.length > 40 || /[\n@]/.test(query)) return undefined
  return { start, query }
}

// A name compared without case or Vietnamese marks, so "@quan" finds "Quán" and "@dao" finds "Đào".
export const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase()

// The prompt with the tag replaced by `name` and a space, and where the caret goes after it.
export function placeMention(text: string, mention: { start: number; query: string }, name: string) {
  const end = mention.start + 1 + mention.query.length
  const rest = text.slice(end)
  const inserted = rest.startsWith(" ") ? name : `${name} `
  return { text: `${text.slice(0, mention.start)}${inserted}${rest}`, caret: mention.start + name.length + 1 }
}
