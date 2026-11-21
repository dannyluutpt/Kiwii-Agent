// Writes posts.json: the showcase pictures that become social posts, each with the prompt that made
// it on production (packages/web/src/showcase.ts), so a post never shows a prompt that is not the real
// one. Run after the showcase changes: bun marketing/social/posts.ts
import { MODEL_NAMES, sample } from "../../packages/web/src/showcase"

const KEYS = ["ca-phe", "nuoc-hoa", "poster", "ao-dai", "pho", "thuong-hieu", "noi-that", "linh-vat"]

await Bun.write(
  new URL("posts.json", import.meta.url),
  JSON.stringify(
    KEYS.map((key) => sample(key)).map((item) => ({
      key: item.key,
      title: item.title.vi,
      model: MODEL_NAMES[item.model],
      prompt: item.prompt,
      image: `../../packages/web/public/showcase/${item.key}-l.webp`,
    })),
    null,
    2,
  ) + "\n",
)
