import { BRAND } from "./brand"

// What a search engine or a link preview reads of each public page. The app is one HTML file for every
// address, so the Worker writes the page's own title, description and canonical address into it; a
// screen behind the sign-in (or an address that is no page) is marked not to be indexed.
const PAGES: Record<string, { title: string; description: string }> = {
  "/": {
    title: `${BRAND}: tạo ảnh và video AI bằng tiếng Việt`,
    description: `${BRAND} là studio tạo, sửa ảnh và làm video bằng AI, chỉ cần mô tả bằng tiếng Việt. GPT Image, Nano Banana, FLUX, Wan, MiniMax và Seedance trong một ứng dụng. Dùng thử miễn phí.`,
  },
  "/pricing": {
    title: `Bảng giá ${BRAND}: gói tạo ảnh và video AI theo tháng`,
    description: `Các gói ${BRAND} trả theo tháng bằng chuyển khoản VietQR, không tự gia hạn. Dùng thử miễn phí, nâng cấp khi cần nhiều credit và nhiều model hơn.`,
  },
  "/terms": {
    title: `Điều khoản sử dụng ${BRAND}`,
    description: `Điều khoản khi dùng ${BRAND}: tài khoản, gói và credit, nội dung không được phép, quyền đối với ảnh và video bạn tạo.`,
  },
  "/privacy": {
    title: `Chính sách quyền riêng tư ${BRAND}`,
    description: `${BRAND} lưu dữ liệu gì, dùng để làm gì, gửi cho nhà cung cấp nào và bạn có quyền gì với dữ liệu của mình.`,
  },
  "/support": {
    title: `Hỗ trợ ${BRAND}`,
    description: `Gửi câu hỏi, yêu cầu hoàn tiền hoặc yêu cầu về dữ liệu cá nhân tới ${BRAND}. Trả lời qua email trong 3 ngày làm việc.`,
  },
  "/refund": {
    title: `Chính sách hoàn tiền ${BRAND}`,
    description: `Khi nào ${BRAND} hoàn credit tự động và khi nào hoàn tiền gói: 100% trong 7 ngày nếu dùng không quá 10 credit.`,
  },
}

export function seo(res: Response, url: URL, origin: string) {
  const page = PAGES[url.pathname]
  const rewriter = new HTMLRewriter()
  if (!page) {
    return rewriter
      .on("head", {
        element: (head) => void head.append('<meta name="robots" content="noindex" />', { html: true }),
      })
      .transform(res)
  }
  const address = `${origin}${url.pathname === "/" ? "/" : url.pathname}`
  return rewriter
    .on("title", { element: (title) => void title.setInnerContent(page.title) })
    .on('meta[name="description"]', { element: (meta) => void meta.setAttribute("content", page.description) })
    .on('meta[property="og:title"]', { element: (meta) => void meta.setAttribute("content", page.title) })
    .on('meta[property="og:description"]', { element: (meta) => void meta.setAttribute("content", page.description) })
    .on("head", {
      element: (head) =>
        void head.append(
          `<link rel="canonical" href="${address}" /><meta property="og:url" content="${address}" /><meta property="og:locale" content="vi_VN" />`,
          { html: true },
        ),
    })
    .transform(res)
}
