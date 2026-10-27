export type GeneratedFile = { bytes: Uint8Array; name: string; mime: string }

// Keeps only safe filename characters; Vietnamese diacritics are stripped so the name works everywhere.
export function safeName(name: string, fallback: string) {
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
  return cleaned || fallback
}
