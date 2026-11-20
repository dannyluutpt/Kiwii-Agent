import { describe, expect, test } from "bun:test"
import { generateOTP, hashOTP, verifyOTP } from "../src/auth/otp"

describe("otp", () => {
  test("generates six digits", () => {
    for (let i = 0; i < 50; i++) expect(generateOTP()).toMatch(/^\d{6}$/)
  })

  test("hash is bound to the email", async () => {
    const hash = await hashOTP("A@Example.com", "123456")
    expect(await verifyOTP("a@example.com", "123456", hash)).toBe(true)
    expect(await verifyOTP("b@example.com", "123456", hash)).toBe(false)
    expect(await verifyOTP("a@example.com", "123457", hash)).toBe(false)
  })
})
