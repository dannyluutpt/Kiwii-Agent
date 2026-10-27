import { describe, expect, test } from "bun:test"
import { generateOTP, hashOTP, verifyOTP } from "../src/auth/otp"

describe("otp", () => {
  test("generates four digits", () => {
    for (let i = 0; i < 50; i++) expect(generateOTP()).toMatch(/^\d{4}$/)
  })

  test("hash is bound to the email", async () => {
    const hash = await hashOTP("A@Example.com", "1234")
    expect(await verifyOTP("a@example.com", "1234", hash)).toBe(true)
    expect(await verifyOTP("b@example.com", "1234", hash)).toBe(false)
    expect(await verifyOTP("a@example.com", "1235", hash)).toBe(false)
  })
})
