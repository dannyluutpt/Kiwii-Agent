import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import { eq } from "drizzle-orm"
import { balance, grant } from "../src/credits/ledger"
import { generations, users } from "../src/db/schema"
import { CreateGeneration, prepareGeneration } from "../src/images/prepare"
import {
  createProject,
  deleteProject,
  listProjects,
  nameFromPrompt,
  ownProject,
  renameProject,
} from "../src/projects/store"
import { testDatabase } from "./db"

const DAY = 24 * 60 * 60 * 1000
const PROMPT = "Chú mèo cam ngủ trên bậu cửa sổ lúc hoàng hôn, nắng ấm chiếu qua rèm"

afterEach(() => mock.restore())

// A Plus member with credits, and the screening model answering every prompt.
async function setup() {
  const db = await testDatabase()
  await db.insert(users).values({
    id: "u1",
    email: "u1@x",
    password_hash: "h",
    password_salt: "s",
    password_iterations: 1,
    tier: "plus",
    tier_until: Date.now() + 30 * DAY,
  })
  await grant(db, { userID: "u1", source: "plan", amount: 100, expiresAt: Date.now() + DAY, reason: "p" })
  const screening = spyOn(globalThis, "fetch").mockImplementation(async () =>
    Response.json({
      choices: [
        { message: { content: JSON.stringify({ allowed: true, reason: "", prompt: "An orange cat asleep" }) } },
      ],
      usage: { cost: 0.0001 },
    }),
  )
  const user = (await db.select().from(users).where(eq(users.id, "u1")).get())!
  const prepare = (request: Record<string, unknown>) =>
    prepareGeneration({
      db,
      bucket: {} as unknown as R2Bucket,
      apiKey: "k",
      user,
      request: CreateGeneration.parse({ model: "gpt-image-2.5", option: "medium", aspectRatio: "1:1", ...request }),
    })
  return { db, screening, prepare }
}

describe("projects", () => {
  test("list newest activity first, rename, and delete without losing a picture", async () => {
    const { db, prepare } = await setup()
    const older = await createProject(db, { userID: "u1", name: "Quảng cáo cà phê", now: 1 })
    const newer = await createProject(db, { userID: "u1", name: "", now: 2 })
    await createProject(db, { userID: "u2", name: "Của người khác", now: 3 })
    expect((await listProjects(db, "u1")).map((p) => p.id)).toEqual([newer.id, older.id])

    await renameProject(db, older, "Cà phê sáng")
    expect((await ownProject(db, "u1", older.id)).name).toBe("Cà phê sáng")

    const run = await prepare({ prompt: PROMPT, projectID: older.id })
    await deleteProject(db, await ownProject(db, "u1", older.id))
    expect(await listProjects(db, "u1")).toHaveLength(1)
    const kept = await db.select().from(generations).where(eq(generations.id, run.generation.id)).get()
    expect(kept?.project_id).toBeNull()
  })

  test("a new project is not piled on an empty, unnamed one", async () => {
    const { db, prepare } = await setup()
    const first = await createProject(db, { userID: "u1", name: "", now: 1 })
    expect((await createProject(db, { userID: "u1", name: "", now: 2 })).id).toBe(first.id)
    expect((await ownProject(db, "u1", first.id)).updated_at).toBe(2)
    // Named, or holding a run, it is a real project: the next one is new.
    expect((await createProject(db, { userID: "u1", name: "Bộ ảnh Tết" })).id).not.toBe(first.id)
    await prepare({ prompt: PROMPT, projectID: first.id })
    expect((await createProject(db, { userID: "u1", name: "" })).id).not.toBe(first.id)
    expect(await createProject(db, { userID: "u2", name: "" })).not.toMatchObject({ id: first.id })
  })

  test("someone else's project reads as missing", async () => {
    const db = await testDatabase()
    const theirs = await createProject(db, { userID: "u2", name: "Của người khác" })
    const error = await ownProject(db, "u1", theirs.id).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ status: 404, code: "PROJECT_NOT_FOUND" })
  })

  test("a project without a name takes the opening words of a prompt", () => {
    expect(nameFromPrompt("  Logo   quán cà phê  ")).toBe("Logo quán cà phê")
    expect(nameFromPrompt(PROMPT)).toBe("Chú mèo cam ngủ trên bậu cửa sổ lúc hoàng hôn,…")
    expect(nameFromPrompt("x".repeat(60))).toBe(`${"x".repeat(48)}…`)
  })
})

describe("prepareGeneration in a project", () => {
  test("the run joins the project, which moves to the top and is named after the prompt", async () => {
    const { db, prepare } = await setup()
    const unnamed = await createProject(db, { userID: "u1", name: "", now: 1 })
    const named = await createProject(db, { userID: "u1", name: "Bộ ảnh Tết", now: 2 })

    const run = await prepare({ prompt: PROMPT, projectID: unnamed.id })
    expect(run.generation.project_id).toBe(unnamed.id)
    const after = await ownProject(db, "u1", unnamed.id)
    expect(after.name).toBe(nameFromPrompt(PROMPT))
    expect((await listProjects(db, "u1"))[0]?.id).toBe(unnamed.id)

    await prepare({ prompt: "Bánh chưng xanh trên mâm gỗ", projectID: named.id })
    expect((await ownProject(db, "u1", named.id)).name).toBe("Bộ ảnh Tết")
  })

  test("a run outside any project belongs to none", async () => {
    const { prepare } = await setup()
    expect((await prepare({ prompt: PROMPT })).generation.project_id).toBeNull()
  })

  test("someone else's project is refused before the screening and the credit hold", async () => {
    const { db, screening, prepare } = await setup()
    const theirs = await createProject(db, { userID: "u2", name: "Của người khác" })
    const before = await balance(db, "u1")
    const error = await prepare({ prompt: PROMPT, projectID: theirs.id }).catch((reason: unknown) => reason)
    expect(error).toMatchObject({ status: 404, code: "PROJECT_NOT_FOUND" })
    expect(screening).not.toHaveBeenCalled()
    expect(await balance(db, "u1")).toBe(before)
    expect(await db.select().from(generations)).toHaveLength(0)
  })
})
