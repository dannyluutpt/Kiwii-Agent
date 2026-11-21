import type { Locale } from "@/context/language"

// The public pages a seller lands on from a search or an ad: one per thing they came to make. Each
// names the templates that make it and the showcase pictures of that kind, so the page shows only
// what the product really does. A page here needs its title and description in
// packages/api/src/seo.ts (src/use-cases.test.ts keeps the two in step) and a line in
// public/sitemap.xml.

type Text = Record<Locale, string>

export type UseCase = {
  // The page's address, in Vietnamese without accents: what people type into a search box.
  path: string
  title: Text
  lead: Text
  // templates.ts ids, in the order shown.
  templates: string[]
  // showcase.ts keys of pictures of this kind.
  samples: string[]
  // showcase.ts clip keys, for the pages about video.
  clips?: string[]
  faq: Array<{ q: Text; a: Text }>
}

const PRICE: UseCase["faq"][number] = {
  q: { vi: "Giá bao nhiêu?", en: "What does it cost?" },
  a: {
    vi: "Có dùng thử miễn phí. Gói trả theo tháng bằng chuyển khoản VietQR và không tự gia hạn; lượt tạo lỗi được hoàn credit.",
    en: "There is a free trial. Plans are paid monthly by VietQR bank transfer and never renew by themselves; a failed run gets its credits back.",
  },
}

export const USE_CASES: UseCase[] = [
  {
    path: "/anh-san-pham-ai",
    title: { vi: "Ảnh sản phẩm bằng AI cho shop online", en: "AI product photos for online shops" },
    lead: {
      vi: "Nền trắng cho Shopee và TikTok Shop, ảnh đặt trong bối cảnh, ảnh chụp từ trên xuống. Mô tả sản phẩm bằng tiếng Việt, không cần studio.",
      en: "White backgrounds for marketplaces, products in a scene, flat lays. Describe the product in plain words; no studio needed.",
    },
    templates: ["white-background", "lifestyle", "flat-lay"],
    samples: ["nuoc-hoa", "ca-phe", "thuong-hieu"],
    faq: [
      {
        q: { vi: "Ảnh có giữ đúng sản phẩm của tôi không?", en: "Will it keep my actual product?" },
        a: {
          vi: "Đính kèm ảnh chụp sản phẩm thật làm ảnh tham chiếu, model sẽ giữ hình dáng và nhãn rồi đổi nền, ánh sáng, bối cảnh theo mô tả. Nên kiểm tra lại chữ trên bao bì trước khi đăng.",
          en: "Attach a real photo of the product as a reference: the model keeps its shape and label and changes the background, light and scene. Check the text on the packaging before you post.",
        },
      },
      {
        q: { vi: "Tôi không biết viết câu lệnh thì sao?", en: "What if I cannot write prompts?" },
        a: {
          vi: "Chọn một mẫu có sẵn, điền tên sản phẩm, câu lệnh đã viết sẵn. Hoặc nhắn cho trợ lý điều bạn muốn bằng tiếng Việt.",
          en: "Pick a template and name your product; the prompt is written. Or tell the assistant what you want.",
        },
      },
      PRICE,
    ],
  },
  {
    path: "/poster-quang-cao-ai",
    title: { vi: "Poster và banner quảng cáo bằng AI", en: "AI posters and ad banners" },
    lead: {
      vi: "Poster khuyến mãi có chữ tiếng Việt đúng dấu, banner cho Facebook và website, thiệp Tết. Gõ dòng chữ bạn muốn, không cần mở phần mềm thiết kế.",
      en: "Sale posters with correct Vietnamese text, banners for Facebook and websites, Lunar New Year cards. Type the words you want.",
    },
    templates: ["sale-poster", "banner", "tet", "thumbnail", "quote"],
    samples: ["poster", "thuong-hieu", "linh-vat"],
    faq: [
      {
        q: { vi: "Chữ tiếng Việt trên ảnh có đúng dấu không?", en: "Is Vietnamese text spelled correctly?" },
        a: {
          vi: "Các mẫu poster dùng GPT Image, model viết chữ trong ảnh chính xác nhất hiện có. Dòng chữ ngắn thường đúng ngay; hãy đọc lại trước khi đăng và tạo lại nếu sai.",
          en: "The poster templates use GPT Image, the most accurate model for text in pictures. Short lines are usually right; read them before posting and run again if not.",
        },
      },
      {
        q: { vi: "Tôi dùng ảnh cho quảng cáo được không?", en: "May I use the pictures in ads?" },
        a: {
          vi: "Được, bạn dùng ảnh mình tạo cho mục đích thương mại. Khi quảng cáo bằng ảnh trông như thật, hãy ghi nhãn nội dung AI theo quy định của nền tảng.",
          en: "Yes, what you make is yours to use commercially. For realistic pictures in ads, label them as AI-generated as the platform requires.",
        },
      },
      PRICE,
    ],
  },
  {
    path: "/anh-thoi-trang-ai",
    title: { vi: "Lookbook và ảnh thời trang bằng AI", en: "AI fashion and lookbook photos" },
    lead: {
      vi: "Người mẫu mặc sản phẩm của shop ở bất kỳ bối cảnh nào, cùng một gương mặt qua mọi bức ảnh. Không cần ekip, không cần đi xa.",
      en: "A model wearing your item in any setting, with the same face in every picture. No crew, no travel.",
    },
    templates: ["lookbook", "headshot", "model-walk"],
    samples: ["ao-dai", "song-hoai"],
    faq: [
      {
        q: { vi: "Làm sao giữ cùng một người mẫu?", en: "How do I keep the same model?" },
        a: {
          vi: "Lưu người mẫu thành một nhân vật từ một đến bốn ảnh, hoặc tạo nhân vật từ mô tả. Chọn nhân vật đó ở mỗi lượt tạo, gương mặt và dáng người được giữ nguyên.",
          en: "Save the model as a character from one to four photos, or create one from a description. Pick that character in each run and the face stays the same.",
        },
      },
      {
        q: { vi: "Tôi dùng ảnh người thật được không?", en: "May I use photos of real people?" },
        a: {
          vi: "Chỉ dùng ảnh của chính bạn hoặc của người đã đồng ý. Bạn chịu trách nhiệm về việc sử dụng hình ảnh của người khác.",
          en: "Only your own photos or those of people who agreed. You are responsible for how another person's image is used.",
        },
      },
      PRICE,
    ],
  },
  {
    path: "/anh-mon-an-ai",
    title: { vi: "Ảnh món ăn bằng AI cho quán và menu", en: "AI food photos for menus and cafés" },
    lead: {
      vi: "Ảnh món ăn hấp dẫn cho menu, GrabFood, ShopeeFood và bài đăng của quán. Mô tả món, chọn góc chụp, xong trong vài giây.",
      en: "Appetising pictures for menus, delivery apps and posts. Describe the dish and it is done in seconds.",
    },
    templates: ["food", "flat-lay", "food-steam"],
    samples: ["pho", "ca-phe", "banh-mi"],
    clips: ["quan-pho"],
    faq: [
      {
        q: { vi: "Ảnh có giống món thật của quán tôi không?", en: "Will it look like my actual dish?" },
        a: {
          vi: "Đính kèm ảnh chụp món thật làm ảnh tham chiếu để giữ đúng cách bày và nguyên liệu, rồi nhờ model làm đẹp ánh sáng và bối cảnh. Ảnh quảng cáo nên phản ánh đúng món khách nhận được.",
          en: "Attach a photo of the real dish as a reference to keep its plating and ingredients, and let the model improve the light and setting. An ad should show what the customer gets.",
        },
      },
      PRICE,
    ],
  },
  {
    path: "/video-san-pham-ai",
    title: { vi: "Video sản phẩm bằng AI cho TikTok và Reels", en: "AI product videos for TikTok and Reels" },
    lead: {
      vi: "Clip 5 đến 10 giây từ một câu mô tả hoặc từ ảnh sản phẩm: máy quay lượn quanh sản phẩm, món ăn bốc khói, người mẫu bước đi. Có cả âm thanh.",
      en: "Clips of 5 to 10 seconds from a sentence or a product photo: the camera circling the product, a steaming dish, a model walking. With sound.",
    },
    templates: ["product-spin", "food-steam", "model-walk"],
    samples: [],
    clips: ["quay-ca-phe", "quan-pho", "hoa-dang"],
    faq: [
      {
        q: { vi: "Clip dài bao lâu và mất bao lâu để tạo?", en: "How long are clips and how long do they take?" },
        a: {
          vi: "Mỗi clip dài 5 hoặc 10 giây và mất vài phút để tạo. Nối cảnh tiếp theo từ khung hình cuối của clip trước để có video dài hơn.",
          en: "A clip is 5 or 10 seconds and takes a few minutes. Start the next scene from the last frame of the one before for a longer video.",
        },
      },
      {
        q: { vi: "Video cần gói nào?", en: "Which plan does video need?" },
        a: {
          vi: "Tạo video dành cho gói trả phí. Giá mỗi clip hiện ngay trước khi bạn bấm tạo.",
          en: "Video is for paid plans. Each clip's price shows before you start it.",
        },
      },
      PRICE,
    ],
  },
]

export const useCase = (path: string) => USE_CASES.find((item) => item.path === path)
