# Bộ nội dung ra mắt Amberpix

Những gì đã làm sẵn, không tốn credit: mọi ảnh và clip lấy từ `packages/web/public/showcase`, đều do
Amberpix tạo trên production, và câu lệnh in trên bài là câu lệnh thật trong `packages/web/src/showcase.ts`.

| Tệp | Là gì | Làm lại bằng |
|---|---|---|
| `marketing/out/amberpix-launch-9x16.mp4` | Phim ra mắt 30 giây, dọc 1080 × 1920, không tiếng | `node marketing/promo/render.mjs` |
| `marketing/out/social/*.png` | 8 ảnh bài đăng 1080 × 1350: ảnh kèm câu lệnh đã tạo ra nó | `bun marketing/social/posts.ts && node marketing/social/build.mjs` |

Phim không có nhạc: khi đăng, chọn nhạc trong thư viện của TikTok hoặc Reels, vì nhạc của nền tảng
được cấp phép sẵn cho bài đăng trên chính nền tảng đó. Bật nhãn "Nội dung do AI tạo" khi đăng
(TikTok bắt buộc với nội dung trông như thật; Meta có nhãn "AI info").

Chưa có tài khoản Facebook và TikTok nào của Amberpix được kết nối (hai tài khoản đang kết nối thuộc
một thương hiệu khác), nên chưa bài nào được đăng. Các bài dưới đây đã sẵn để đăng tay hoặc lên lịch.

## Lịch 2 tuần đầu

| Ngày | Kênh | Bài |
|---|---|---|
| T2 tuần 1 | Facebook Page, TikTok, Reels | Phim ra mắt (bài 1) |
| T3 | Facebook | Ảnh "Cà phê phin Sài Gòn xưa" (bài 2) |
| T4 | TikTok, Reels | Cắt 9 giây đầu của phim làm video "mô tả bằng tiếng Việt" (bài 3) |
| T5 | Facebook | Ảnh "Chai nước hoa hổ phách" (bài 4) |
| T6 | Facebook | Ảnh "Poster lễ hội ánh sáng" (bài 5) |
| T7 | Trang cá nhân | Bài của người sáng lập (bài 6) |
| T2 tuần 2 | Facebook | Ảnh "Nhận diện thương hiệu Mây Tea" (bài 7) |
| T3 | TikTok, Reels | Cắt đoạn giây 15 đến 20 của phim: sửa ảnh bằng một câu (bài 8) |
| T4 | Facebook | Ảnh "Áo dài giữa phố cổ Hội An" (bài 9) |
| T5 | Facebook | Ảnh "Tô phở bò buổi sáng" (bài 10) |
| T6 | Facebook | Ảnh "Phòng khách Đông Dương" (bài 11) |
| T7 | Facebook | Ảnh "Linh vật mèo đội nón lá" (bài 12) |

## Bài 1. Phim ra mắt

Tệp: `marketing/out/amberpix-launch-9x16.mp4`

**Facebook / Reels**

> Ảnh sản phẩm đẹp như studio, chỉ cần một câu tiếng Việt.
>
> Amberpix tạo ảnh, sửa ảnh và làm video ngắn bằng AI cho người bán hàng online: mô tả thứ bạn muốn,
> chọn model, bấm tạo. Có sẵn mẫu cho ảnh sản phẩm nền trắng, poster khuyến mãi, lookbook, banner Tết.
>
> Trả theo tháng bằng chuyển khoản VietQR, không tự gia hạn, lượt tạo lỗi được hoàn credit.
>
> Dùng thử miễn phí: amberpix.com

**TikTok**

> Ảnh sản phẩm không cần studio 📸 Gõ một câu tiếng Việt là xong. Dùng thử miễn phí ở amberpix.com
> #amberpix #anhsanpham #AI #banhangonline #tiktokshop #shopee

## Bài 2, 4, 5, 7, 9, 10, 11, 12. Ảnh kèm câu lệnh

Tệp: `marketing/out/social/<tên>.png`. Mỗi bài dùng chung khung caption, đổi dòng đầu:

> {Dòng mở}
>
> Câu lệnh nằm ngay trên ảnh: chép lại, đổi tên sản phẩm của bạn vào là dùng được.
> Làm bằng Amberpix ({model}). Dùng thử miễn phí: amberpix.com
>
> #amberpix #AI #anhsanpham #banhangonline

| Bài | Tệp | Dòng mở |
|---|---|---|
| 2 | `ca-phe.png` | Ly cà phê này không có buổi chụp nào cả. Chỉ có một câu mô tả. |
| 4 | `nuoc-hoa.png` | Ảnh chai nước hoa kiểu quảng cáo, làm trong lúc pha xong ly cà phê. |
| 5 | `poster.png` | Poster sự kiện có chữ tiếng Việt đúng dấu, không cần mở phần mềm thiết kế. |
| 7 | `thuong-hieu.png` | Mở quán trà? Thử xem bộ nhận diện trước khi thuê thiết kế. |
| 9 | `ao-dai.png` | Lookbook áo dài ở Hội An, không vé máy bay, không ekip. |
| 10 | `pho.png` | Ảnh món ăn cho menu quán, làm từ một câu. |
| 11 | `noi-that.png` | Khách muốn xem phòng khách kiểu Đông Dương trước khi chốt? Dựng thử trong một phút. |
| 12 | `linh-vat.png` | Linh vật cho thương hiệu của bạn, vẽ theo mô tả. |

Dưới mỗi bài, bình luận đầu tiên ghim liên kết: `https://amberpix.com/?ref=<mã của bạn>` (mã lấy ở
trang Tài khoản; ai đăng ký qua liên kết và mua gói thì cả hai được cộng credit).

## Bài 3 và 8. Hai bản cắt từ phim

```sh
# Bài 3: "Mô tả bằng tiếng Việt", giây 3,2 đến 9
ffmpeg -ss 3.2 -to 9 -i marketing/out/amberpix-launch-9x16.mp4 -c:v libx264 -crf 20 -c:a aac marketing/out/cut-mo-ta.mp4
# Bài 8: "Sửa ảnh bằng một câu", giây 15 đến 20,5
ffmpeg -ss 15 -to 20.5 -i marketing/out/amberpix-launch-9x16.mp4 -c:v libx264 -crf 20 -c:a aac marketing/out/cut-sua-anh.mp4
```

> Bài 3 (TikTok): Gõ tiếng Việt, ra ảnh quảng cáo ☕ #amberpix #AI #anhsanpham
>
> Bài 8 (TikTok): Xoá hết người trong ảnh du lịch bằng đúng một câu 🏛️ #amberpix #suaanh #AI

## Bài 6. Trang cá nhân người sáng lập

> Mình làm một studio ảnh AI một mình, và đây là lý do.
>
> Bạn bè mình bán hàng online đều gặp cùng một chuyện: ảnh sản phẩm. Thuê chụp thì đắt và chậm, tự
> chụp thì không ra dáng, còn các công cụ AI nước ngoài thì tính tiền bằng thẻ quốc tế, giao diện
> tiếng Anh, tự gia hạn mỗi tháng.
>
> Amberpix làm ngược lại mấy điểm đó: mô tả bằng tiếng Việt, trả bằng chuyển khoản VietQR, hết tháng
> thì dừng chứ không tự trừ tiền, lượt nào lỗi thì hoàn credit.
>
> Mình đang tìm 10 shop để làm lại ảnh sản phẩm miễn phí và xin nhận xét thật. Bạn nào muốn thử,
> bình luận ngành hàng của mình ở dưới nhé.
>
> amberpix.com

Sửa lại cho đúng giọng của bạn trước khi đăng; đây là bài duy nhất nên do chính bạn viết lại.

## Nội dung chưa làm được, và vì sao

| Nội dung trong playbook | Cần gì |
|---|---|
| Trước/sau từ ảnh chụp điện thoại của một sản phẩm thật | Ảnh gốc của một sản phẩm thật và vài lượt tạo (khoảng 3 credit mỗi ảnh Nano Banana 2K) |
| Một chiếc áo, sáu bối cảnh | 6 lượt tạo có ảnh tham chiếu |
| Người mẫu nhất quán, bốn bộ đồ | Một nhân vật đã lưu và 4 lượt tạo |
| Case study của một shop | Một khách hàng thật đồng ý cho đăng |
| So sánh chi phí chụp studio | Số liệu chi phí thật của bạn |
