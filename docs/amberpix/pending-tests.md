# Test chờ duyệt

Những việc dưới đây chưa chạy vì tốn credit OpenRouter hoặc chạm vào production. Mọi thứ khác đã
được kiểm bằng máy chủ model giả lập (`packages/api/script/mock-openrouter.ts`), không tốn gì.

Số tiền là ước tính từ giá đo ngày 2026-10-27 ghi trong `packages/api/README.md`, tỷ giá khoảng
25.500 đ/USD. Giá thật có thể lệch.

## Sau khi merge PR #113

| # | Việc | Để làm gì | Chi phí ước tính |
|---|---|---|---|
| 1 | Đăng ký một tài khoản mới trên amberpix.com | Xác nhận email mã 6 số tới nơi và nhập được | 0 |
| 2 | Tạo 1 ảnh FLUX 3 Klein 1K | Xác nhận dòng "ping" 15 giây không làm hỏng luồng ảnh thật, ô ảnh hoàn tất bình thường | 1 credit, dưới 0,02 USD (khoảng 500 đ) |
| 3 | Tạo 1 ảnh GPT Image 2.5 mức low, tắt Wi-Fi giữa chừng rồi bật lại | Xác nhận ô ảnh vẫn "đang chạy" rồi tự hiện ảnh, không báo thất bại | khoảng 0,01 USD (khoảng 250 đ) |
| 4 | Chuyển khoản thật một đơn Starter | Xác nhận kích hoạt gói theo cách ghi mới (một khối) trên D1 thật. Workflow `sepay-smoke` chỉ kiểm tra khoá webhook, không kiểm tra được bước này | 299.000 đ, vào chính tài khoản ngân hàng của bạn |

Tổng cho mục 1 đến 3: dưới 0,05 USD (khoảng 1.300 đ). Mục 4 không mất tiền ra ngoài.

## Chưa làm, cần bạn quyết

- **Ảnh thu nhỏ cho thư viện.** Hiện mỗi ô ảnh tải bản gốc. Tạo bản 480/960 px qua Cloudflare Images
  sẽ nhanh hơn nhiều trên điện thoại, nhưng tính phí theo số ảnh biến đổi (5.000 ảnh đầu mỗi tháng
  miễn phí, sau đó khoảng 0,50 USD mỗi 1.000). Cần bạn đồng ý về chi phí định kỳ.
- **Ảnh và clip mẫu cho preset, ứng dụng một chạm** (mục 9 trong `higgsfield-research.md`): khoảng 15 ảnh
  và 10 clip. Sẽ báo giá chính xác trước khi chạy.
- **Video quảng bá và 10 nội dung đầu tiên** (`go-to-market.md`, mục 4 và 7): cần ảnh, clip tạo thật bằng
  Amberpix.
