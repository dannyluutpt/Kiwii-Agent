/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

// Reads the colours straight from theme.css so a palette edit cannot quietly break legibility.
const css = readFileSync(new URL("./theme.css", import.meta.url), "utf8")
const colour = (name: string) => {
  const match = new RegExp(`--k-${name}:\\s*(#[0-9a-f]{6});`, "i").exec(css)
  if (!match?.[1]) throw new Error(`--k-${name} is not a hex colour in theme.css`)
  return match[1]
}

// WCAG 2 relative luminance and contrast ratio.
function luminance(hex: string) {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r = 0, g = 0, b = 0] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string) {
  const [light, dark] = [luminance(colour(a)), luminance(colour(b))].sort((x, y) => y - x)
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05)
}

describe("theme contrast", () => {
  test("text reads on every surface it sits on", () => {
    expect(contrast("label", "canvas")).toBeGreaterThanOrEqual(7)
    for (const surface of ["canvas", "surface", "surface-2"]) {
      expect(contrast("label-2", surface)).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrast("label-3", "canvas")).toBeGreaterThanOrEqual(4.5)
  })

  test("the yellow works as a fill under black text and as text on the canvas", () => {
    expect(contrast("on-accent", "accent")).toBeGreaterThanOrEqual(7)
    expect(contrast("on-accent", "accent-hover")).toBeGreaterThanOrEqual(7)
    expect(contrast("accent", "canvas")).toBeGreaterThanOrEqual(7)
    expect(contrast("accent", "surface-2")).toBeGreaterThanOrEqual(4.5)
  })

  test("status colours stay legible", () => {
    for (const status of ["danger", "warning", "success", "info"]) {
      expect(contrast(status, "canvas")).toBeGreaterThanOrEqual(4.5)
    }
  })
})
