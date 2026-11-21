import type { Locale } from "@/context/language"

// Ready-made starting points: a person fills in a few words and gets a full prompt with the model and
// the frame that suit it, instead of facing an empty box. A template is data, not code: adding one is
// adding an entry here. Prompts are written in Vietnamese, the language the rewrite works from.

type Text = Record<Locale, string>

export type TemplateSlot = {
  id: string
  label: Text
  placeholder: Text
  // Left empty, the slot's sentence is dropped from the prompt.
  optional?: boolean
}

export type Template = {
  id: string
  category: "product" | "ads" | "people" | "social" | "video"
  kind: "image" | "video"
  title: Text
  lead: Text
  // The image model it suits; a clip keeps the model the person last chose.
  model?: string
  aspectRatio: string
  // The person attaches this in the composer after the template is applied.
  needsPhoto?: Text
  slots: TemplateSlot[]
  // "{id}" is the slot's value; a sentence in [brackets] is kept only when every slot in it is filled.
  prompt: string
}

export const CATEGORIES: Array<{ id: Template["category"]; title: Text }> = [
  { id: "product", title: { vi: "Ảnh sản phẩm", en: "Product photos" } },
  { id: "ads", title: { vi: "Quảng cáo và khuyến mãi", en: "Ads and promotions" } },
  { id: "people", title: { vi: "Chân dung và thời trang", en: "Portraits and fashion" } },
  { id: "social", title: { vi: "Mạng xã hội", en: "Social media" } },
  { id: "video", title: { vi: "Video ngắn", en: "Short clips" } },
]

const PRODUCT: TemplateSlot = {
  id: "product",
  label: { vi: "Sản phẩm", en: "Product" },
  placeholder: { vi: "ví dụ: chai serum thuỷ tinh nắp vàng", en: "e.g. a glass serum bottle with a gold cap" },
}
const PRODUCT_PHOTO = {
  vi: "Đính kèm ảnh sản phẩm thật trong khung soạn để giữ đúng hình dáng và nhãn.",
  en: "Attach a real photo of the product in the composer to keep its shape and label.",
}

export const TEMPLATES: Template[] = [
  {
    id: "white-background",
    category: "product",
    kind: "image",
    title: { vi: "Sản phẩm nền trắng", en: "Product on white" },
    lead: { vi: "Ảnh sạch cho Shopee, TikTok Shop, Lazada.", en: "A clean shot for marketplace listings." },
    model: "nano-banana-2.1",
    aspectRatio: "1:1",
    needsPhoto: PRODUCT_PHOTO,
    slots: [PRODUCT],
    prompt:
      "Ảnh sản phẩm thương mại điện tử của {product}, đặt giữa khung trên nền trắng tinh, ánh sáng studio mềm đều từ hai bên, bóng đổ nhẹ dưới chân sản phẩm, chi tiết sắc nét, màu sắc trung thực, không có chữ, không có vật trang trí.",
  },
  {
    id: "lifestyle",
    category: "product",
    kind: "image",
    title: { vi: "Sản phẩm trong bối cảnh", en: "Product in a scene" },
    lead: { vi: "Đặt sản phẩm vào khung cảnh đời thường.", en: "Place the product in an everyday setting." },
    model: "nano-banana-2.1",
    aspectRatio: "4:3",
    needsPhoto: PRODUCT_PHOTO,
    slots: [
      PRODUCT,
      {
        id: "scene",
        label: { vi: "Bối cảnh", en: "Scene" },
        placeholder: { vi: "ví dụ: bàn gỗ cạnh cửa sổ buổi sáng", en: "e.g. a wooden table by a morning window" },
      },
    ],
    prompt:
      "Ảnh quảng cáo phong cách đời thường của {product} đặt trên {scene}, ánh sáng tự nhiên ấm, độ sâu trường ảnh nông làm nền mờ nhẹ, vài đạo cụ đơn giản cùng tông màu xung quanh, sản phẩm là điểm nhấn rõ nhất, không có chữ.",
  },
  {
    id: "flat-lay",
    category: "product",
    kind: "image",
    title: { vi: "Chụp từ trên xuống", en: "Flat lay" },
    lead: { vi: "Bố cục phẳng gọn gàng, hợp mỹ phẩm và đồ ăn.", en: "A tidy top-down layout." },
    model: "nano-banana-2.1",
    aspectRatio: "1:1",
    needsPhoto: PRODUCT_PHOTO,
    slots: [
      PRODUCT,
      {
        id: "props",
        label: { vi: "Đạo cụ đi kèm", en: "Props" },
        placeholder: { vi: "ví dụ: lá bạc hà, lát chanh, khăn linen", en: "e.g. mint leaves, lemon slices, linen" },
        optional: true,
      },
    ],
    prompt:
      "Ảnh flat lay chụp thẳng từ trên xuống của {product} ở giữa khung trên mặt nền màu be nhạt. [Xung quanh xếp gọn {props}.] Ánh sáng mềm, bóng đổ ngắn, bố cục cân đối, nhiều khoảng trống, không có chữ.",
  },
  {
    id: "food",
    category: "product",
    kind: "image",
    title: { vi: "Món ăn hấp dẫn", en: "Appetising food" },
    lead: { vi: "Ảnh món ăn cho menu và bài đăng quán.", en: "A dish shot for menus and posts." },
    model: "gpt-image-2.5",
    aspectRatio: "4:3",
    slots: [
      {
        id: "dish",
        label: { vi: "Món ăn", en: "Dish" },
        placeholder: { vi: "ví dụ: tô bún bò Huế đầy đủ topping", en: "e.g. a bowl of Hue beef noodle soup" },
      },
    ],
    prompt:
      "Ảnh ẩm thực cận cảnh của {dish}, góc chụp 45 độ, hơi nóng bốc nhẹ, ánh sáng cửa sổ từ bên trái, bàn gỗ sẫm màu, đũa và chén nước chấm bên cạnh, màu sắc tươi và thật, độ sâu trường ảnh nông, không có chữ.",
  },
  {
    id: "sale-poster",
    category: "ads",
    kind: "image",
    title: { vi: "Poster khuyến mãi", en: "Sale poster" },
    lead: { vi: "Poster có chữ tiếng Việt rõ ràng.", en: "A poster with clear Vietnamese text." },
    model: "gpt-image-2.5",
    aspectRatio: "3:4",
    slots: [
      PRODUCT,
      {
        id: "headline",
        label: { vi: "Dòng chữ chính", en: "Headline" },
        placeholder: { vi: "ví dụ: GIẢM 50% CUỐI TUẦN", en: "e.g. 50% OFF THIS WEEKEND" },
      },
      {
        id: "detail",
        label: { vi: "Dòng phụ", en: "Small print" },
        placeholder: { vi: "ví dụ: Từ 20 đến 22/11, freeship toàn quốc", en: "e.g. 20 to 22 Nov, free shipping" },
        optional: true,
      },
    ],
    prompt:
      'Poster khuyến mãi dọc cho {product}. Sản phẩm lớn ở nửa dưới, nền màu đậm nổi bật với ánh sáng rực. Nửa trên là dòng chữ lớn in đậm, viết đúng chính tả tiếng Việt có dấu: "{headline}". [Bên dưới là dòng chữ nhỏ hơn: "{detail}".] Bố cục hiện đại, tương phản cao, không thêm chữ nào khác.',
  },
  {
    id: "banner",
    category: "ads",
    kind: "image",
    title: { vi: "Banner ngang", en: "Wide banner" },
    lead: { vi: "Ảnh bìa Facebook, banner website.", en: "A cover image or website banner." },
    model: "gpt-image-2.5",
    aspectRatio: "16:9",
    slots: [
      {
        id: "subject",
        label: { vi: "Nội dung chính", en: "Subject" },
        placeholder: { vi: "ví dụ: bộ sưu tập áo dài Tết", en: "e.g. the Tet ao dai collection" },
      },
      {
        id: "headline",
        label: { vi: "Dòng chữ", en: "Text" },
        placeholder: { vi: "ví dụ: Đón Tết rực rỡ", en: "e.g. A bright new year" },
        optional: true,
      },
    ],
    prompt:
      'Banner ngang cho {subject}, chủ thể đặt lệch phải, bên trái để khoảng trống rộng. [Trong khoảng trống là dòng chữ lớn, đúng chính tả tiếng Việt có dấu: "{headline}".] Màu sắc hài hoà, ánh sáng điện ảnh, phong cách quảng cáo cao cấp.',
  },
  {
    id: "tet",
    category: "ads",
    kind: "image",
    title: { vi: "Thiệp và banner Tết", en: "Lunar New Year card" },
    lead: { vi: "Không khí Tết với hoa mai, hoa đào, sắc đỏ vàng.", en: "A festive Tet look in red and gold." },
    model: "gpt-image-2.5",
    aspectRatio: "1:1",
    slots: [
      {
        id: "greeting",
        label: { vi: "Lời chúc", en: "Greeting" },
        placeholder: { vi: "ví dụ: Chúc Mừng Năm Mới", en: "e.g. Chúc Mừng Năm Mới" },
      },
      {
        id: "brand",
        label: { vi: "Tên shop hoặc thương hiệu", en: "Shop or brand name" },
        placeholder: { vi: "ví dụ: Tiệm Bánh Nhà Mây", en: "e.g. Tiệm Bánh Nhà Mây" },
        optional: true,
      },
    ],
    prompt:
      'Thiệp chúc Tết Việt Nam tông đỏ và vàng kim, cành mai vàng và cành đào hồng viền hai bên, lồng đèn và bao lì xì, hoạ tiết mây truyền thống. Ở giữa là dòng chữ thư pháp lớn, đúng chính tả tiếng Việt có dấu: "{greeting}". [Phía dưới là dòng chữ nhỏ: "{brand}".] Sang trọng, ấm áp, không thêm chữ nào khác.',
  },
  {
    id: "headshot",
    category: "people",
    kind: "image",
    title: { vi: "Ảnh chân dung công việc", en: "Professional headshot" },
    lead: { vi: "Ảnh hồ sơ cho CV, LinkedIn, trang công ty.", en: "A profile photo for a CV or LinkedIn." },
    model: "nano-banana-2.1",
    aspectRatio: "3:4",
    needsPhoto: {
      vi: "Đính kèm một ảnh rõ mặt của chính bạn, hoặc chọn một nhân vật đã lưu.",
      en: "Attach a clear photo of yourself, or pick a saved character.",
    },
    slots: [
      {
        id: "outfit",
        label: { vi: "Trang phục", en: "Outfit" },
        placeholder: { vi: "ví dụ: vest xanh navy, sơ mi trắng", en: "e.g. a navy blazer and a white shirt" },
      },
    ],
    prompt:
      "Ảnh chân dung công việc của người trong ảnh tham chiếu, giữ nguyên khuôn mặt, mặc {outfit}, chụp từ ngực trở lên, nhìn thẳng ống kính và mỉm cười nhẹ, nền xám nhạt mờ, ánh sáng studio mềm, da tự nhiên, sắc nét.",
  },
  {
    id: "lookbook",
    category: "people",
    kind: "image",
    title: { vi: "Lookbook thời trang", en: "Fashion lookbook" },
    lead: { vi: "Người mẫu mặc sản phẩm của shop.", en: "A model wearing your item." },
    model: "nano-banana-2.1",
    aspectRatio: "3:4",
    needsPhoto: {
      vi: "Đính kèm ảnh món đồ; muốn giữ cùng một người mẫu thì chọn nhân vật đã lưu.",
      en: "Attach a photo of the item; pick a saved character to keep the same model.",
    },
    slots: [
      {
        id: "item",
        label: { vi: "Món đồ", en: "Item" },
        placeholder: { vi: "ví dụ: đầm lụa xanh ngọc dáng dài", en: "e.g. a long jade silk dress" },
      },
      {
        id: "place",
        label: { vi: "Địa điểm", en: "Place" },
        placeholder: { vi: "ví dụ: con phố cổ Hội An lúc chiều", en: "e.g. an old Hoi An street at dusk" },
      },
    ],
    prompt:
      "Ảnh lookbook thời trang toàn thân, người mẫu Việt Nam mặc {item}, đứng tự nhiên tại {place}, ánh sáng giờ vàng, phong cách tạp chí, vải và đường may rõ nét, nền mờ nhẹ, không có chữ.",
  },
  {
    id: "thumbnail",
    category: "social",
    kind: "image",
    title: { vi: "Ảnh bìa video", en: "Video thumbnail" },
    lead: { vi: "Thumbnail YouTube nổi bật với chữ lớn.", en: "A bold YouTube thumbnail." },
    model: "gpt-image-2.5",
    aspectRatio: "16:9",
    slots: [
      {
        id: "topic",
        label: { vi: "Chủ đề video", en: "Video topic" },
        placeholder: { vi: "ví dụ: review 5 quán phở ngon nhất Hà Nội", en: "e.g. the five best pho shops in Hanoi" },
      },
      {
        id: "headline",
        label: { vi: "Chữ trên ảnh", en: "Text on the image" },
        placeholder: { vi: "ví dụ: PHỞ NGON NHẤT?", en: "e.g. THE BEST PHO?" },
      },
    ],
    prompt:
      'Thumbnail YouTube về {topic}, hình ảnh chính cận cảnh và biểu cảm, màu bão hoà, tương phản mạnh. Dòng chữ rất lớn viền đậm, đúng chính tả tiếng Việt có dấu: "{headline}". Bố cục đọc được ngay ở kích thước nhỏ, không thêm chữ nào khác.',
  },
  {
    id: "quote",
    category: "social",
    kind: "image",
    title: { vi: "Bài đăng trích dẫn", en: "Quote post" },
    lead: { vi: "Ảnh vuông có câu chữ cho Facebook, Instagram.", en: "A square post with a line of text." },
    model: "gpt-image-2.5",
    aspectRatio: "1:1",
    slots: [
      {
        id: "quote",
        label: { vi: "Câu chữ", en: "Text" },
        placeholder: { vi: "ví dụ: Mỗi ngày một chút, rồi sẽ tới", en: "e.g. A little each day gets you there" },
      },
      {
        id: "mood",
        label: { vi: "Hình nền", en: "Background" },
        placeholder: { vi: "ví dụ: đồi chè buổi sớm có sương", en: "e.g. misty tea hills at dawn" },
      },
    ],
    prompt:
      'Bài đăng mạng xã hội hình vuông, nền là {mood} được làm tối nhẹ. Ở giữa là dòng chữ lớn dễ đọc, đúng chính tả tiếng Việt có dấu: "{quote}". Kiểu chữ hiện đại, nhiều khoảng thở, không thêm chữ nào khác.',
  },
  {
    id: "product-spin",
    category: "video",
    kind: "video",
    title: { vi: "Xoay quanh sản phẩm", en: "Product orbit" },
    lead: { vi: "Máy quay lượn quanh sản phẩm trên bục.", en: "The camera circles the product." },
    aspectRatio: "9:16",
    needsPhoto: {
      vi: "Đặt ảnh sản phẩm làm khung hình đầu để clip bắt đầu từ đúng sản phẩm của bạn.",
      en: "Set a product photo as the first frame so the clip starts from your product.",
    },
    slots: [PRODUCT],
    prompt:
      "Clip quảng cáo sản phẩm: {product} đứng trên bục tròn giữa studio tối, ánh sáng viền làm nổi đường nét. Máy quay lượn chậm một vòng cung quanh sản phẩm từ trái sang phải, giữ sản phẩm ở giữa khung, phản chiếu lấp lánh trên bề mặt. Chuyển động mượt, không có chữ.",
  },
  {
    id: "food-steam",
    category: "video",
    kind: "video",
    title: { vi: "Món ăn nóng hổi", en: "Steaming dish" },
    lead: { vi: "Cận cảnh món ăn bốc khói cho quán.", en: "A close-up of a hot dish." },
    aspectRatio: "9:16",
    slots: [
      {
        id: "dish",
        label: { vi: "Món ăn", en: "Dish" },
        placeholder: { vi: "ví dụ: nồi lẩu thái sôi sùng sục", en: "e.g. a bubbling Thai hotpot" },
      },
    ],
    prompt:
      "Clip ẩm thực cận cảnh: {dish} trên bàn gỗ, hơi nóng bốc lên, ánh sáng ấm từ bên cạnh. Máy quay đẩy chậm vào gần rồi nâng nhẹ lên, đũa gắp một miếng lên khỏi tô. Màu tươi, chuyển động chậm rãi, có tiếng xèo và tiếng sôi, không có chữ.",
  },
  {
    id: "model-walk",
    category: "video",
    kind: "video",
    title: { vi: "Người mẫu bước đi", en: "Model walk" },
    lead: { vi: "Clip thời trang ngắn cho TikTok, Reels.", en: "A short fashion clip." },
    aspectRatio: "9:16",
    needsPhoto: {
      vi: "Dùng ảnh lookbook làm khung hình đầu, hoặc chọn nhân vật đã lưu.",
      en: "Use a lookbook photo as the first frame, or pick a saved character.",
    },
    slots: [
      {
        id: "item",
        label: { vi: "Trang phục", en: "Outfit" },
        placeholder: { vi: "ví dụ: áo dài trắng thêu hoa sen", en: "e.g. a white ao dai with lotus embroidery" },
      },
      {
        id: "place",
        label: { vi: "Địa điểm", en: "Place" },
        placeholder: { vi: "ví dụ: hành lang nắng của một ngôi nhà cổ", en: "e.g. a sunlit corridor of an old house" },
      },
    ],
    prompt:
      "Clip thời trang: người mẫu Việt Nam mặc {item} bước chậm về phía máy quay tại {place}, tà áo bay nhẹ theo bước chân, ánh nắng xiên qua. Máy quay lùi dần giữ người mẫu toàn thân ở giữa khung. Chuyển động mượt, không có chữ.",
  },
]

// A look added to a picture's prompt.
export const STYLES: Array<{ id: string; title: Text; prompt: string }> = [
  { id: "none", title: { vi: "Mặc định", en: "Default" }, prompt: "" },
  {
    id: "studio",
    title: { vi: "Studio", en: "Studio" },
    prompt: "Phong cách chụp studio thương mại, ánh sáng softbox, nền sạch.",
  },
  {
    id: "film",
    title: { vi: "Điện ảnh", en: "Cinematic" },
    prompt: "Phong cách điện ảnh, ống kính 35mm, tông màu teal và cam, hạt phim nhẹ.",
  },
  {
    id: "minimal",
    title: { vi: "Tối giản", en: "Minimal" },
    prompt: "Phong cách tối giản, bảng màu trung tính, nhiều khoảng trống.",
  },
  {
    id: "luxury",
    title: { vi: "Sang trọng", en: "Luxury" },
    prompt: "Phong cách sang trọng, chất liệu đá cẩm thạch và kim loại vàng, ánh sáng tương phản.",
  },
  {
    id: "pastel",
    title: { vi: "Pastel", en: "Pastel" },
    prompt: "Bảng màu pastel tươi sáng, ánh sáng mềm, không khí nhẹ nhàng.",
  },
  {
    id: "illustration",
    title: { vi: "Minh hoạ", en: "Illustration" },
    prompt: "Vẽ theo phong cách minh hoạ phẳng hiện đại, đường nét gọn, màu khối.",
  },
]

// A camera move added to a clip's prompt, in place of the one the template wrote.
export const MOVES: Array<{ id: string; title: Text; prompt: string }> = [
  { id: "none", title: { vi: "Theo mẫu", en: "As written" }, prompt: "" },
  { id: "push", title: { vi: "Đẩy vào", en: "Push in" }, prompt: "Máy quay đẩy chậm thẳng vào chủ thể." },
  { id: "pull", title: { vi: "Lùi ra", en: "Pull out" }, prompt: "Máy quay lùi chậm ra xa, mở rộng khung cảnh." },
  { id: "orbit", title: { vi: "Lượn vòng", en: "Orbit" }, prompt: "Máy quay lượn một vòng cung quanh chủ thể." },
  { id: "crane", title: { vi: "Nâng lên", en: "Crane up" }, prompt: "Máy quay nâng dần lên cao, nhìn xuống chủ thể." },
  { id: "pan", title: { vi: "Lia ngang", en: "Pan" }, prompt: "Máy quay lia ngang chậm từ trái sang phải." },
  {
    id: "handheld",
    title: { vi: "Cầm tay", en: "Handheld" },
    prompt: "Máy quay cầm tay, rung nhẹ tự nhiên như quay bằng điện thoại.",
  },
  { id: "static", title: { vi: "Đứng yên", en: "Static" }, prompt: "Máy quay đứng yên trên chân máy." },
]

// The template's prompt with the person's words in it. A [bracketed] sentence whose slots are not all
// filled is left out; the look or the camera move follows at the end.
export function fillTemplate(template: Template, values: Record<string, string>, extra = "") {
  const value = (id: string) => (values[id] ?? "").trim().replace(/\s+/g, " ")
  const filled = template.prompt
    .replace(/\s*\[([^\]]*)\]/g, (_, sentence: string) =>
      [...sentence.matchAll(/\{(\w+)\}/g)].every((match) => value(match[1]!)) ? ` ${sentence}` : "",
    )
    .replace(/\{(\w+)\}/g, (_, id: string) => value(id))
  return [filled.trim(), extra].filter(Boolean).join(" ")
}

// Whether every slot the template cannot do without has words in it.
export function templateReady(template: Template, values: Record<string, string>) {
  return template.slots.every((slot) => slot.optional || (values[slot.id] ?? "").trim().length > 0)
}

// The picture on a template's card: what the template made on production with a seller's words in its
// slots (marketing/templates/generate.ts). For a clip, a frame of it.
export const templateExample = (template: Template) => `/templates/${template.id}.webp`
