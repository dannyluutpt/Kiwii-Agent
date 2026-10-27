// Measures the real OpenRouter cost of every image option and prints the credit price each one
// should have. Run from packages/api:
//   OPENROUTER_API_KEY=sk-or-... bun script/calibrate-image-cost.ts [--only gpt-image-2.5] [--apply]
// --apply writes app_config.image_models on the production D1 through wrangler, which the API
// reads on the next request (no deploy needed). Budget: roughly 3–5 USD for a full run.
import { IMAGE_MODELS, type CreditOverrides } from "../src/images/models"
import { generateImages } from "../src/images/openrouter-images"

const FEE = 1.055
const MARGIN = 1.3
const USD_PER_CREDIT = 0.03
const PROMPT =
  "A small ceramic cup of Vietnamese coffee on a wooden table, soft morning window light, shallow depth of field"

const args = process.argv.slice(2)
const apply = args.includes("--apply")
const only = args.includes("--only") ? args[args.indexOf("--only") + 1] : undefined
const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) {
  console.error("OPENROUTER_API_KEY is required")
  process.exit(1)
}

const overrides: CreditOverrides = {}
const rows: Array<[string, string, string, string, string]> = []
for (const model of IMAGE_MODELS) {
  if (only && model.id !== only) continue
  for (const option of model.options) {
    let worst = 0
    for (const aspectRatio of ["1:1", "16:9"]) {
      let cost: number | undefined
      for (let attempt = 0; attempt < 2 && cost === undefined; attempt++) {
        try {
          const result = await generateImages({
            apiKey,
            slug: model.slug,
            prompt: PROMPT,
            n: 1,
            aspectRatio,
            resolution: model.param === "resolution" ? option.id : undefined,
            quality: model.param === "quality" ? option.id : undefined,
            references: [],
          })
          cost = result.costUsd
        } catch (error) {
          console.error(`  ${model.id} ${option.id} ${aspectRatio}: ${error instanceof Error ? error.message : error}`)
        }
      }
      if (cost === undefined) continue
      worst = Math.max(worst, cost)
      rows.push([model.id, option.id, aspectRatio, cost.toFixed(4), ""])
    }
    if (worst === 0) continue
    const credits = Math.max(1, Math.ceil((worst * FEE * MARGIN) / USD_PER_CREDIT))
    rows.push([model.id, option.id, "→ credits", `${worst.toFixed(4)}`, String(credits)])
    overrides[model.id] = { ...overrides[model.id], [option.id]: credits }
  }
}

console.table(
  rows.map(([model, option, aspect, cost, credits]) => ({ model, option, aspect, cost_usd: cost, credits })),
)
console.log("\napp_config.image_models =", JSON.stringify(overrides))

if (apply) {
  const sql = `INSERT OR REPLACE INTO app_config (key, value, updated_at) VALUES ('image_models', '${JSON.stringify(overrides).replaceAll("'", "''")}', ${Date.now()});`
  const proc = Bun.spawn(["bunx", "wrangler", "d1", "execute", "kiwii", "--remote", "--command", sql], {
    stdout: "inherit",
    stderr: "inherit",
  })
  process.exit(await proc.exited)
}
