// A still of a clip, for the next clip to start from: its last frame, or the one at a given second.
// The clip comes from this site, so the canvas it is drawn on can be read back.

// The second to grab from a clip `duration` seconds long: `at` when given, else the end. A decoder
// may hold nothing at the very end, so the end is a twentieth of a second before it.
export function stillTime(duration: number, at?: number) {
  const length = Number.isFinite(duration) && duration > 0 ? duration : 0
  if (at !== undefined) return Math.min(Math.max(0, at), length)
  return Math.max(0, length - 0.05)
}

// Resolves on the media element's `name` event, rejects on its error or after `ms`.
function event(media: HTMLMediaElement, name: string, ms = 20_000) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${name} after ${ms} ms`)), ms)
    media.addEventListener(
      name,
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
    media.addEventListener("error", () => reject(new Error("the clip did not load")), { once: true })
  })
}

// A JPEG of the clip at `at` seconds, or of its last frame. iOS draws a frame only for a muted,
// inline video that is in the page, and seeks only once the clip's metadata has loaded.
export function grabStill(src: string, at?: number) {
  const video = document.createElement("video")
  video.muted = true
  video.playsInline = true
  video.preload = "auto"
  video.setAttribute("aria-hidden", "true")
  video.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none"
  document.body.append(video)
  const loaded = event(video, "loadedmetadata")
  video.src = src
  return loaded
    .then(() => {
      const seeked = event(video, "seeked")
      video.currentTime = stillTime(video.duration, at)
      return seeked
    })
    .then(() => {
      const canvas = document.createElement("canvas")
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const context = canvas.getContext("2d")
      if (!context || canvas.width === 0) throw new Error("the clip has no frame to draw")
      context.drawImage(video, 0, 0)
      return new Promise<{ blob: Blob; width: number; height: number }>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob ? resolve({ blob, width: canvas.width, height: canvas.height }) : reject(new Error("no JPEG")),
          "image/jpeg",
          0.92,
        ),
      )
    })
    .finally(() => video.remove())
}
