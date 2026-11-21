// Writes carousel.json: a six-slide post, "four prompts a shop can copy", from the templates on
// /templates with a seller's words in their slots. bun marketing/social/carousel.ts
import { fillTemplate, TEMPLATES } from "../../packages/web/src/templates"

const PICKS: Array<[string, Record<string, string>]> = [
  ["white-background", { product: "chai serum thuỷ tinh nắp vàng" }],
  ["lifestyle", { product: "hũ nến thơm màu hổ phách", scene: "bàn gỗ cạnh cửa sổ buổi sáng" }],
  ["sale-poster", { product: "ly trà sữa trân châu", headline: "MUA 1 TẶNG 1", detail: "Chỉ cuối tuần này" }],
  ["product-spin", { product: "chai nước hoa thuỷ tinh" }],
]

await Bun.write(
  new URL("carousel.json", import.meta.url),
  JSON.stringify(
    [
      { kind: "cover", title: "4 câu lệnh ảnh sản phẩm", lead: "Chép lại, đổi tên sản phẩm của bạn, dùng được ngay." },
      ...PICKS.flatMap(([id, words], index) =>
        TEMPLATES.filter((template) => template.id === id).map((template) => ({
          kind: "prompt",
          step: `${index + 1}/4`,
          title: template.title.vi,
          lead: template.lead.vi,
          prompt: fillTemplate(template, words),
        })),
      ),
      { kind: "end", title: "Có sẵn 14 mẫu như vậy", lead: "Điền tên sản phẩm, phần còn lại đã viết sẵn. Dùng thử miễn phí." },
    ],
    null,
    2,
  ) + "\n",
)
