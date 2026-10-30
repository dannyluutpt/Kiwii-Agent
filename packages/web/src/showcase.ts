// Pictures on the public website, each made with Amberpix itself on production from the prompt
// beside it. The files live in public/showcase in two sizes: `-s` at 640px and `-l` at 1280px on the
// long edge, as WebP. The edits also keep the original photo, `-before`, stretched to the same frame:
// the model redraws the photo on its own canvas, so the two then line up.
export type Sample = {
  key: string
  title: { vi: string; en: string }
  model: "flux-3-klein" | "nano-banana-2.1" | "gpt-image-2.5"
  prompt: string
  // The large file's size; `small` is the small file's width.
  width: number
  height: number
  small: number
}

export const MODEL_NAMES: Record<Sample["model"], string> = {
  "flux-3-klein": "FLUX 3 Klein",
  "nano-banana-2.1": "Nano Banana 2.1",
  "gpt-image-2.5": "GPT Image 2.5",
}

const SAMPLES: Sample[] = [
  {
    key: "ao-dai",
    title: { vi: "Áo dài giữa phố cổ Hội An", en: "An áo dài in Hội An's old town" },
    model: "nano-banana-2.1",
    prompt:
      "Chân dung thời trang một cô gái Việt mặc áo dài lụa vàng nghệ đứng giữa phố cổ Hội An lúc hoàng hôn, đèn lồng đỏ phía sau mờ ảo, nắng vàng ấm viền tóc, ống kính 85mm, nhiếp ảnh thời trang điện ảnh",
    width: 956,
    height: 1280,
    small: 478,
  },
  {
    key: "song-hoai",
    title: { vi: "Sông Hoài đêm hoa đăng", en: "Lanterns on the Hoài River" },
    model: "flux-3-klein",
    prompt:
      "Sông Hoài Hội An về đêm, hàng trăm đèn lồng nhiều màu phản chiếu trên mặt nước, thuyền gỗ thả hoa đăng, ánh sáng lung linh, nhiếp ảnh du lịch, chi tiết sắc nét",
    width: 1280,
    height: 719,
    small: 640,
  },
  {
    key: "pho",
    title: { vi: "Tô phở bò buổi sáng", en: "A morning bowl of phở" },
    model: "gpt-image-2.5",
    prompt:
      "Tô phở bò Hà Nội bốc khói trên bàn gỗ, rau thơm, chanh, ớt tươi, ánh sáng cửa sổ buổi sáng, ảnh chụp món ăn chuyên nghiệp, góc 45 độ, hậu cảnh mờ",
    width: 1024,
    height: 1024,
    small: 640,
  },
  {
    key: "ca-phe",
    title: { vi: "Cà phê phin Sài Gòn xưa", en: "Drip coffee in old Saigon" },
    model: "flux-3-klein",
    prompt:
      "Phin cà phê nhỏ giọt trên ly sữa đặc trong quán cà phê Sài Gòn xưa, nắng xiên qua cửa chớp gỗ, bụi nắng lơ lửng, tông màu ấm hoài cổ, ảnh cận cảnh",
    width: 848,
    height: 1280,
    small: 424,
  },
  {
    key: "poster",
    title: { vi: "Poster lễ hội ánh sáng", en: "A light festival poster" },
    model: "gpt-image-2.5",
    prompt:
      "Poster sự kiện với dòng chữ tiêu đề lớn 'LỄ HỘI ÁNH SÁNG ĐÀ NẴNG' và dòng chữ nhỏ '12 - 14.12.2026', phong cách retro thập niên 70, cầu Rồng phun lửa và pháo hoa trên sông Hàn, bảng màu cam vàng tím, typography rõ ràng",
    width: 853,
    height: 1280,
    small: 427,
  },
  {
    key: "linh-vat",
    title: { vi: "Linh vật mèo đội nón lá", en: "A cat mascot in a conical hat" },
    model: "gpt-image-2.5",
    prompt:
      "Linh vật chú mèo vàng 3D dễ thương đội nón lá, tay cầm bóng bay hình ngôi sao, phong cách hoạt hình 3D, nền vàng hổ phách trơn, ánh sáng studio mềm",
    width: 1024,
    height: 1024,
    small: 640,
  },
  {
    key: "bac-thang",
    title: { vi: "Ruộng bậc thang Mù Cang Chải", en: "Mù Cang Chải rice terraces" },
    model: "nano-banana-2.1",
    prompt:
      "Ruộng bậc thang Mù Cang Chải mùa lúa chín vàng, sương sớm bảng lảng trong thung lũng, nắng sớm xuyên qua dãy núi, góc nhìn từ trên cao, nhiếp ảnh phong cảnh",
    width: 1280,
    height: 714,
    small: 640,
  },
  {
    key: "nuoc-hoa",
    title: { vi: "Chai nước hoa hổ phách", en: "An amber perfume bottle" },
    model: "flux-3-klein",
    prompt:
      "Chai nước hoa thủy tinh màu hổ phách đặt trên tảng đá bazan đen, giọt nước li ti, ánh sáng viền vàng, nền đen sang trọng, ảnh quảng cáo sản phẩm cao cấp",
    width: 960,
    height: 1280,
    small: 480,
  },
  {
    key: "thanh-pho-may",
    title: { vi: "Thành phố trên mây", en: "A city above the clouds" },
    model: "flux-3-klein",
    prompt:
      "Thành phố nổi trên mây lúc bình minh, những ngôi chùa mái cong Việt Nam kết hợp kiến trúc tương lai, đàn cá chép vàng khổng lồ bay quanh, concept art điện ảnh, ánh sáng vàng rực",
    width: 1280,
    height: 848,
    small: 640,
  },
  {
    key: "da-lat",
    title: { vi: "Đồi thông Đà Lạt", en: "Đà Lạt's misty pines" },
    model: "nano-banana-2.1",
    prompt:
      "Đồi thông Đà Lạt trong sương sớm, căn nhà gỗ nhỏ có ô cửa đèn vàng ấm, con đường đất đỏ uốn lượn, không khí se lạnh, màu ảnh phim",
    width: 1200,
    height: 896,
    small: 640,
  },
  {
    key: "ha-long",
    title: { vi: "Vịnh Hạ Long lúc bình minh", en: "Hạ Long Bay at dawn" },
    model: "flux-3-klein",
    prompt:
      "Vịnh Hạ Long lúc bình minh, thuyền buồm nâu giữa những đảo đá vôi, mặt nước phẳng lặng phản chiếu bầu trời hồng tím, toàn cảnh điện ảnh",
    width: 1280,
    height: 549,
    small: 640,
  },
  {
    key: "banh-mi",
    title: { vi: "Xe bánh mì đêm Sài Gòn", en: "A bánh mì cart at night" },
    model: "nano-banana-2.1",
    prompt:
      "Xe bánh mì trên vỉa hè Sài Gòn về đêm, xe máy chạy vụt qua để lại vệt đèn, biển hiệu neon, khói bếp bay lên, nhiếp ảnh đường phố điện ảnh",
    width: 1280,
    height: 859,
    small: 640,
  },
  {
    key: "noi-that",
    title: { vi: "Phòng khách Đông Dương", en: "An Indochine living room" },
    model: "gpt-image-2.5",
    prompt:
      "Phòng khách phong cách Đông Dương hiện đại, sàn gạch bông, bàn ghế gỗ và mây tre, cây xanh lớn, nắng chiều chiếu qua cửa sổ gỗ, ảnh kiến trúc nội thất",
    width: 1280,
    height: 853,
    small: 640,
  },
  {
    key: "thuong-hieu",
    title: { vi: "Nhận diện thương hiệu Mây Tea", en: "Brand kit for Mây Tea" },
    model: "gpt-image-2.5",
    prompt:
      "Bộ nhận diện thương hiệu cho quán trà tên 'Mây Tea': logo tối giản hình đám mây ôm chiếc lá trà, in trên ly giấy, túi giấy và danh thiếp, tông xanh bạc hà và kem, ảnh mockup studio",
    width: 1024,
    height: 1024,
    small: 640,
  },
  {
    key: "meo",
    title: { vi: "Chú mèo sưởi nắng", en: "A cat in the sun" },
    model: "nano-banana-2.1",
    prompt:
      "Chú mèo cam mập ngủ cuộn tròn trên bậu cửa sổ gỗ, nắng chiều vàng ấm chiếu vào, chậu cây nhỏ bên cạnh, ảnh chụp chân thực",
    width: 1280,
    height: 1280,
    small: 640,
  },
  {
    key: "meo-mua",
    title: { vi: "Chú mèo trong đêm mưa", en: "The same cat on a rainy night" },
    model: "nano-banana-2.1",
    prompt:
      "Giữ nguyên chú mèo cam và bậu cửa sổ, đổi khung cảnh ngoài cửa sổ thành đêm mưa với ánh đèn neon xanh hồng phản chiếu trên kính ướt, trong phòng có đèn bàn ấm",
    width: 1280,
    height: 1280,
    small: 640,
  },
  {
    key: "pho-krakow",
    title: { vi: "Phố cổ Kraków", en: "Kraków's old town" },
    model: "nano-banana-2.1",
    prompt:
      "Xoá toàn bộ người trong ảnh. Giữ nguyên kiến trúc, mặt đường, ánh sáng, màu sắc, góc chụp và mọi chi tiết khác; lấp phần trống tự nhiên như ảnh chụp lúc phố vắng",
    // Cropped from the top to the Louvre's shape, so the two comparisons stand the same height.
    width: 1280,
    height: 714,
    small: 640,
  },
  {
    key: "louvre",
    title: { vi: "Bảo tàng Louvre", en: "The Louvre" },
    model: "nano-banana-2.1",
    prompt:
      "Xoá toàn bộ người trong ảnh. Giữ nguyên kim tự tháp kính, toà nhà, mặt sân, bầu trời, ánh sáng, màu sắc, góc chụp và mọi chi tiết khác; lấp phần trống tự nhiên như ảnh chụp lúc quảng trường vắng",
    width: 1280,
    height: 714,
    small: 640,
  },
]

export const sample = (key: string) => SAMPLES.find((s) => s.key === key) ?? SAMPLES[0]

export const sampleSrc = (s: Sample) => `/showcase/${s.key}-l.webp`

export const sampleSrcset = (s: Sample) =>
  `/showcase/${s.key}-s.webp ${s.small}w, /showcase/${s.key}-l.webp ${s.width}w`
