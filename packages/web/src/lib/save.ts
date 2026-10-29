// iPhone and iPad keep pictures in Photos rather than a Downloads folder, and in the Home Screen app
// a download link opens a file preview with no way back to the app. There a file is saved through the
// share sheet ("Lưu hình ảnh", "Lưu vào Tệp"); everywhere else a plain download link does the job.

// iPadOS presents itself as a Mac; only the touch screen tells the two apart.
export function isAppleTouch(userAgent: string, touchPoints: number) {
  return /iPhone|iPad|iPod/.test(userAgent) || (userAgent.includes("Macintosh") && touchPoints > 1)
}

export function savesThroughShare() {
  return typeof navigator.canShare === "function" && isAppleTouch(navigator.userAgent, navigator.maxTouchPoints)
}

const EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
}

// Gives a file's name the extension its type implies when it has none ("amberpix-1" → "amberpix-1.png").
export function withExtension(name: string, type: string) {
  const extension = EXTENSIONS[type]
  return /\.\w+$/.test(name) || !extension ? name : `${name}.${extension}`
}

// The last few files fetched for sharing. iOS opens the share sheet only within a few seconds of a
// tap, which a large picture on a slow connection can outlast, so the viewer fetches the open picture
// ahead and the tap finds it ready.
const prepared = new Map<string, Promise<File | undefined>>()

export function prepareFile(url: string, name: string) {
  const known = prepared.get(url)
  if (known) return known
  const file = fetch(url)
    .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(`HTTP ${res.status}`))))
    .then((blob) => new File([blob], withExtension(name, blob.type), { type: blob.type }))
    .catch(() => {
      prepared.delete(url)
      return undefined
    })
  prepared.set(url, file)
  for (const key of prepared.keys()) if (prepared.size > 3) prepared.delete(key)
  return file
}

export type ShareResult = "shared" | "cancelled" | "again" | "failed"

// Opens the share sheet for a file. "again" means the tap had expired by the time the file arrived;
// the file is at hand now, so the next tap opens the sheet straight away.
export async function shareFile(url: string, name: string): Promise<ShareResult> {
  const file = await prepareFile(url, name)
  if (!file || !navigator.canShare({ files: [file] })) return "failed"
  // iOS before 16.4 cannot tell; there share() itself refuses an expired tap.
  if ("userActivation" in navigator && !navigator.userActivation.isActive) return "again"
  return navigator.share({ files: [file] }).then(
    (): ShareResult => "shared",
    (error: unknown): ShareResult => {
      const reason = error instanceof DOMException ? error.name : ""
      if (reason === "AbortError") return "cancelled"
      if (reason === "NotAllowedError") return "again"
      return "failed"
    },
  )
}
