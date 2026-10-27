import { describe, expect, test } from "bun:test"
import { findMemo, generateMemo, vietQRUrl } from "../src/billing/plans"

describe("billing memo", () => {
  test("generated memos are found again inside bank content, case-insensitively", () => {
    for (let i = 0; i < 20; i++) {
      const memo = generateMemo()
      expect(memo).toMatch(/^KW[A-Z2-9]{8}$/)
      expect(findMemo(`MBVCB.123 chuyen tien ${memo.toLowerCase()} ck`)).toBe(memo)
    }
  })

  test("ignores look-alike codes", () => {
    expect(findMemo("KW12345678")).toBeUndefined()
    expect(findMemo("noi dung khac")).toBeUndefined()
  })

  test("builds a VietQR url", () => {
    expect(vietQRUrl({ bank: "MB", account: "0123", amount: 299000, memo: "KWABCDEFGH" })).toBe(
      "https://img.vietqr.io/image/MB-0123-compact2.png?amount=299000&addInfo=KWABCDEFGH",
    )
  })
})
