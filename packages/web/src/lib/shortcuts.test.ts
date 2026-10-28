/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { matchShortcut } from "./shortcuts"

const key = (key: string, mods: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", boolean>> = {}) => ({
  key,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  isComposing: false,
  ...mods,
})

describe("matchShortcut", () => {
  const newChat = { key: "o", mod: true, shift: true }

  test("Command or Control both count as Mod", () => {
    expect(matchShortcut(key("O", { metaKey: true, shiftKey: true }), newChat)).toBe(true)
    expect(matchShortcut(key("o", { ctrlKey: true, shiftKey: true }), newChat)).toBe(true)
  })

  test("modifiers must match exactly", () => {
    expect(matchShortcut(key("o", { metaKey: true }), newChat)).toBe(false)
    expect(matchShortcut(key("o", { shiftKey: true }), newChat)).toBe(false)
    expect(matchShortcut(key("o", { metaKey: true, shiftKey: true, altKey: true }), newChat)).toBe(false)
  })

  test("ignores keys typed while an input method is composing", () => {
    expect(matchShortcut({ ...key("Escape"), isComposing: true }, { key: "Escape" })).toBe(false)
    expect(matchShortcut(key("Escape"), { key: "Escape" })).toBe(true)
  })
})
