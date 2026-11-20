import { describe, expect, test } from "bun:test"
import { testSite } from "./d1"

const EMAIL = "an@example.com"
const PASSWORD = "mat-khau-dai"

type Site = Awaited<ReturnType<typeof testSite>>

// The code in the last email sent.
const lastCode = (site: Site) => /Mã của bạn: (\d+)/.exec(site.outbox.at(-1)?.text ?? "")?.[1] ?? ""
// A code that is certainly not the one sent.
const wrong = (code: string) => (code === "000000" ? "000001" : "000000")

async function signUp(site: Site, visitor: Pick<Site, "post" | "get"> = site) {
  expect((await visitor.post("/api/auth/signup", { email: EMAIL, password: PASSWORD })).status).toBe(200)
  expect((await visitor.post("/api/auth/signup/verify", { email: EMAIL, code: lastCode(site) })).status).toBe(200)
}

describe("sign-up", () => {
  test("a six-digit code verifies the email, signs in and grants the trial", async () => {
    const site = await testSite()
    await site.post("/api/auth/signup", { email: EMAIL, password: PASSWORD })
    expect(lastCode(site)).toMatch(/^\d{6}$/)
    expect((await site.post("/api/auth/signup/verify", { email: EMAIL, code: lastCode(site) })).status).toBe(200)
    const me = (await (await site.get("/api/auth/me")).json()) as { user: { email: string }; credits: number }
    expect(me.user.email).toBe(EMAIL)
    expect(me.credits).toBe(3)
  })

  test("five wrong codes lock the code, the right one included", async () => {
    const site = await testSite()
    await site.post("/api/auth/signup", { email: EMAIL, password: PASSWORD })
    const code = lastCode(site)
    for (const remaining of [4, 3, 2, 1, 0]) {
      const res = await site.post("/api/auth/signup/verify", { email: EMAIL, code: wrong(code) })
      expect(await res.json()).toMatchObject({ error: { code: "OTP_INVALID", remaining } })
    }
    const locked = await site.post("/api/auth/signup/verify", { email: EMAIL, code })
    expect(await locked.json()).toMatchObject({ error: { code: "OTP_LOCKED" } })
  })

  test("guesses sent side by side each take a try", async () => {
    const site = await testSite()
    await site.post("/api/auth/signup", { email: EMAIL, password: PASSWORD })
    const code = lastCode(site)
    const answers = await Promise.all(
      Array.from({ length: 12 }, () => site.post("/api/auth/signup/verify", { email: EMAIL, code: wrong(code) })),
    )
    const codes = await Promise.all(
      answers.map(async (res) => ((await res.json()) as { error: { code: string } }).error.code),
    )
    expect(codes.filter((item) => item === "OTP_INVALID")).toHaveLength(5)
    expect(codes.filter((item) => item === "OTP_LOCKED")).toHaveLength(7)
  })

  test("a four-digit code is not a code", async () => {
    const site = await testSite()
    await site.post("/api/auth/signup", { email: EMAIL, password: PASSWORD })
    expect((await site.post("/api/auth/signup/verify", { email: EMAIL, code: "1234" })).status).toBe(400)
  })
})

describe("passwords", () => {
  test("a reset signs every device out and the old password stops working", async () => {
    const site = await testSite()
    await signUp(site)
    const thief = site.visitor()
    expect((await thief.post("/api/auth/login", { email: EMAIL, password: PASSWORD })).status).toBe(200)
    expect((await thief.get("/api/auth/me")).status).toBe(200)

    await site.post("/api/auth/forgot", { email: EMAIL })
    const reset = await site.post("/api/auth/reset", { email: EMAIL, code: lastCode(site), password: "mat-khau-moi" })
    expect(reset.status).toBe(200)
    expect((await thief.get("/api/auth/me")).status).toBe(401)
    expect((await site.get("/api/auth/me")).status).toBe(401)
    expect((await site.post("/api/auth/login", { email: EMAIL, password: PASSWORD })).status).toBe(401)
    expect((await site.post("/api/auth/login", { email: EMAIL, password: "mat-khau-moi" })).status).toBe(200)
  })

  test("a wrong reset code changes nothing, and five lock it", async () => {
    const site = await testSite()
    await signUp(site)
    await site.post("/api/auth/forgot", { email: EMAIL })
    const code = lastCode(site)
    for (const _ of [1, 2, 3, 4, 5]) {
      const res = await site.post("/api/auth/reset", { email: EMAIL, code: wrong(code), password: "mat-khau-moi" })
      expect(await res.json()).toMatchObject({ error: { code: "OTP_INVALID" } })
    }
    const locked = await site.post("/api/auth/reset", { email: EMAIL, code, password: "mat-khau-moi" })
    expect(await locked.json()).toMatchObject({ error: { code: "OTP_LOCKED" } })
    expect((await site.post("/api/auth/login", { email: EMAIL, password: PASSWORD })).status).toBe(200)
  })

  test("changing the password signs the other devices out and keeps this one in", async () => {
    const site = await testSite()
    await signUp(site)
    const other = site.visitor()
    await other.post("/api/auth/login", { email: EMAIL, password: PASSWORD })
    const changed = await site.post("/api/account/password", { current: PASSWORD, next: "mat-khau-moi" })
    expect(changed.status).toBe(200)
    expect((await site.get("/api/auth/me")).status).toBe(200)
    expect((await other.get("/api/auth/me")).status).toBe(401)
  })

  test("an unknown email is answered like a known one", async () => {
    const site = await testSite()
    const res = await site.post("/api/auth/forgot", { email: "nobody@example.com" })
    expect(await res.json()).toEqual({ ok: true })
    expect(site.outbox).toHaveLength(0)
  })
})
