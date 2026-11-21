import { describe, expect, test } from "bun:test"
import { testSite } from "./d1"

// R2 as a set of keys.
function bucket() {
  const keys = new Set<string>()
  return {
    keys,
    binding: {
      delete: async (given: string | string[]) => void [given].flat().forEach((key) => keys.delete(key)),
    } as unknown as R2Bucket,
  }
}

async function library() {
  const store = bucket()
  const site = await testSite({ BUCKET: store.binding })
  await site.post("/api/auth/signup", { email: "an@example.com", password: "mat-khau-dai" })
  const code = /Mã của bạn: (\d+)/.exec(site.outbox.at(-1)?.text ?? "")?.[1]
  await site.post("/api/auth/signup/verify", { email: "an@example.com", code })
  const me = ((await (await site.get("/api/auth/me")).json()) as { user: { id: string } }).user.id
  // A run of two pictures and a run of one, as the library lists them.
  for (const [run, picture] of [
    ["g1", "a"],
    ["g1", "b"],
    ["g2", "c"],
  ] as const) {
    site.sqlite.run(
      `insert or ignore into generations (id, user_id, status, model, option, aspect_ratio, n, prompt_raw, credits_reserved, created_at) values ('${run}', '${me}', 'done', 'flux-3-klein', '1K', '1:1', 2, 'p', 1, 1)`,
    )
    site.sqlite.run(
      `insert into files (id, user_id, r2_key, name, mime, size, kind, generation_id, created_at) values ('f-${picture}', '${me}', 'u/${me}/${picture}.png', 'n', 'image/png', 1, 'image', '${run}', 1)`,
    )
    site.sqlite.run(
      `insert into generation_images (id, generation_id, user_id, file_id, position, created_at) values ('i-${picture}', '${run}', '${me}', 'f-${picture}', 0, 1)`,
    )
    store.keys.add(`u/${me}/${picture}.png`)
  }
  const remove = (id: string) => site.request("DELETE", `/api/images/assets/${id}`)
  return { site, store, me, remove }
}

const count = (site: Awaited<ReturnType<typeof testSite>>, table: string) =>
  (site.sqlite.query(`select count(*) as n from ${table}`).get() as { n: number }).n

describe("deleting from the library", () => {
  test("one picture of a run goes, with its file; the run and its other picture stay", async () => {
    const { site, store, me, remove } = await library()
    expect((await remove("i-a")).status).toBe(200)
    expect(store.keys.has(`u/${me}/a.png`)).toBe(false)
    expect(store.keys.has(`u/${me}/b.png`)).toBe(true)
    expect(count(site, "generation_images")).toBe(2)
    expect(count(site, "generations")).toBe(2)
  })

  test("a run's last picture takes the run with it", async () => {
    const { site, remove } = await library()
    expect((await remove("i-c")).status).toBe(200)
    expect(count(site, "generations")).toBe(1)
    expect((await remove("i-c")).status).toBe(404)
  })

  test("someone else's picture is not found", async () => {
    const { site } = await library()
    const other = site.visitor()
    await other.post("/api/auth/signup", { email: "binh@example.com", password: "mat-khau-dai" })
    const code = /Mã của bạn: (\d+)/.exec(site.outbox.at(-1)?.text ?? "")?.[1]
    await other.post("/api/auth/signup/verify", { email: "binh@example.com", code })
    expect((await other.request("DELETE", "/api/images/assets/i-a")).status).toBe(404)
    expect(count(site, "generation_images")).toBe(3)
  })
})
