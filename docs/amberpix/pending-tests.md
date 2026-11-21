# Việc còn chờ bạn

Mọi thứ trong repo đã được kiểm bằng máy chủ model giả lập (`packages/api/script/mock-openrouter.ts`),
không tốn gì. Dưới đây là những việc chỉ bạn làm được, hoặc tốn tiền nên chưa chạy.

Số tiền là ước tính từ giá đo ngày 2026-10-27 ghi trong `packages/api/README.md`, tỷ giá khoảng
25.500 đ/USD. Giá thật có thể lệch.

## Tạo ảnh trên production đang không chạy được (2026-11-21)

Bạn đã duyệt tạo ảnh và clip minh hoạ cho 14 mẫu. Lượt đầu tiên (một ảnh món ăn, GPT Image mức high)
bị từ chối hai lần liên tiếp ở bước kiểm duyệt nội dung, trước khi trừ credit:
`SCREENING_UNAVAILABLE`. Bước này gọi model ngôn ngữ qua OpenRouter (`anthropic/claude-haiku-5.5`, rồi
dự phòng `google/gemini-2.5-flash-lite`); cả hai đều không trả lời. Lượt tạo gần nhất thành công trên
production là 14 ngày trước.

Nguyên nhân có khả năng nhất là tài khoản OpenRouter hết số dư hoặc khoá API có vấn đề, vì cả hai
model cùng hỏng. Tôi không đọc được log của Worker nên chưa xác nhận được. Điều này có nghĩa là
**khách hàng hiện cũng không tạo được ảnh**.

Việc cần làm: xem số dư ở openrouter.ai (mục Credits) và nạp thêm nếu hết; sau đó chạy
`AMBERPIX_SESSION=<giá trị cookie kiwii_session của bạn> bun marketing/templates/generate.ts` để tạo
14 ví dụ (khoảng 120 credit Amberpix), hoặc báo tôi chạy lại.

## Kiểm tra trên production (cần tài khoản đăng nhập)

Tôi không tự làm được: đăng ký tài khoản cần vượt Turnstile và đọc mã trong hộp thư.

| # | Việc | Để làm gì | Chi phí ước tính |
|---|---|---|---|
| 1 | Đăng ký một tài khoản mới | Email mã 6 số tới nơi và nhập được | 0 |
| 2 | Tạo 1 ảnh FLUX 3 Klein 1K, rồi mở thư viện | Ô ảnh hoàn tất; ảnh thu nhỏ hiện ra (bước này dùng Cloudflare Images lần đầu) | 1 credit, dưới 0,02 USD (khoảng 500 đ) |
| 3 | Tạo 1 ảnh GPT Image mức low, tắt Wi-Fi giữa chừng rồi bật lại | Ô ảnh vẫn "đang chạy" rồi tự hiện ảnh | khoảng 0,01 USD (khoảng 250 đ) |
| 4 | Chuyển khoản thật một đơn Starter | Kích hoạt gói trên cơ sở dữ liệu thật | 299.000 đ, vào chính tài khoản ngân hàng của bạn |

Đã kiểm trên production sau khi deploy ngày 2026-11-21, không cần đăng nhập: trang chủ, bảng giá, ba
trang chính sách và trang Hỗ trợ có tiêu đề riêng; `robots.txt`, `sitemap.xml`; migration 0015 đã chạy;
mã 4 số bị từ chối; một tin gửi qua form Hỗ trợ đã về tới hộp thư của bạn.

## Việc cần tài khoản của bạn

- **Turnstile chưa bật trên production.** `/api/health` báo `turnstile: false`, nghĩa là form đăng ký,
  đăng nhập và Hỗ trợ chưa có bước chống robot; hiện chỉ có giới hạn tần suất. Tạo một widget Turnstile
  trong Cloudflare, rồi đặt `TURNSTILE_SITE_KEY` (biến) và `TURNSTILE_SECRET_KEY` (secret) cho Worker
  `kiwii-agent` ở Settings, Variables and Secrets. Không cần deploy lại.

- **Trang Facebook và tài khoản TikTok cho Amberpix.** Hai tài khoản đang kết nối với công cụ đăng bài
  thuộc một thương hiệu khác, nên chưa bài nào được đăng. Tạo xong và kết nối, các bài trong
  `marketing/content.md` lên lịch được ngay.
- **Hộp thư nhận email cho amberpix.com** (không bắt buộc). Tên miền chưa có bản ghi MX nên không
  nhận được thư; trang Hỗ trợ dùng form gửi thẳng về hộp thư của bạn. Muốn có địa chỉ
  `support@amberpix.com`, bật Email Routing trong Cloudflare (Dashboard, mục Email).
- **Pháp lý và thuế.** Ba trang chính sách là bản nháp theo đúng những gì hệ thống làm. Trước khi
  quảng cáo rộng, nhờ luật sư hoặc kế toán xem: hình thức kinh doanh, hoá đơn điện tử, nghĩa vụ theo
  Luật Bảo vệ dữ liệu cá nhân (ảnh khuôn mặt, chuyển dữ liệu ra nước ngoài), và việc thông báo
  website với Bộ Công Thương. Chi tiết ở `go-to-market.md`, mục 6.
- **Chính sách hoàn tiền.** Tôi đặt mặc định: hoàn 100% trong 7 ngày nếu dùng không quá 10 credit.
  Đổi con số trong `packages/web/src/legal.ts` nếu bạn muốn khác.
- **Thưởng giới thiệu.** Mặc định người mời nhận 30 credit, người được mời nhận 20, khi người được mời
  mua gói đầu tiên. Đổi bằng `app_config.referral` trong D1, không cần deploy.

## Nội dung cần chạy thật

Chưa chạy; tôi sẽ báo giá từng lượt trước khi bạn duyệt.

- Ảnh và clip minh hoạ cho 14 mẫu ở trang Mẫu (hiện mỗi mẫu là biểu tượng và chữ).
- Các nội dung trước/sau từ sản phẩm thật, một áo sáu bối cảnh, người mẫu nhất quán
  (`marketing/content.md`, bảng cuối).
