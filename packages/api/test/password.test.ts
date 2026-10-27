import { describe, expect, test } from "bun:test"
import { hashPassword, needsRehash, PASSWORD_ITERATIONS, validatePassword, verifyPassword } from "../src/auth/password"

describe("password", () => {
  test("round-trips and rejects wrong password", async () => {
    const stored = await hashPassword("correct horse battery")
    expect(stored.iterations).toBe(PASSWORD_ITERATIONS)
    expect(stored.salt).toHaveLength(32)
    expect(stored.hash).toHaveLength(64)
    expect(await verifyPassword("correct horse battery", stored)).toBe(true)
    expect(await verifyPassword("correct horse batterz", stored)).toBe(false)
  })

  test("salts differ between hashes of the same password", async () => {
    const a = await hashPassword("same")
    const b = await hashPassword("same")
    expect(a.salt).not.toBe(b.salt)
    expect(a.hash).not.toBe(b.hash)
  })

  test("flags old iteration counts for rehash", () => {
    expect(needsRehash(12_000)).toBe(true)
    expect(needsRehash(PASSWORD_ITERATIONS)).toBe(false)
  })

  test("validates length", () => {
    expect(validatePassword("short")).toBeDefined()
    expect(validatePassword("long enough")).toBeUndefined()
  })
})
