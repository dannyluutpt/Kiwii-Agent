/// <reference types="bun" />
import { describe, expect, test } from "bun:test"
import { isAppleTouch, withExtension } from "./save"

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"
const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15"
const ANDROID =
  "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36"

describe("isAppleTouch", () => {
  test("iPhone, and iPad behind its Mac user agent, save through the share sheet", () => {
    expect(isAppleTouch(IPHONE, 5)).toBe(true)
    expect(isAppleTouch(MAC, 5)).toBe(true)
  })

  test("a Mac and Android phones keep downloading", () => {
    expect(isAppleTouch(MAC, 0)).toBe(false)
    expect(isAppleTouch(ANDROID, 5)).toBe(false)
  })
})

describe("withExtension", () => {
  test("adds the extension a picture's type implies", () => {
    expect(withExtension("kiwii-01ABC", "image/png")).toBe("kiwii-01ABC.png")
    expect(withExtension("kiwii-01ABC", "image/jpeg")).toBe("kiwii-01ABC.jpg")
  })

  test("keeps a name that has one, and an unknown type alone", () => {
    expect(withExtension("bao-cao.docx", "application/octet-stream")).toBe("bao-cao.docx")
    expect(withExtension("kiwii-01ABC", "application/octet-stream")).toBe("kiwii-01ABC")
  })
})
