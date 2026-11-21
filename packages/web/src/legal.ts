import { BRAND, SUPPORT_URL } from "@/brand"
import type { Locale } from "@/context/language"

// The terms, the privacy policy and the refund policy, as data: the same page renders all three. Each
// says what the product really does (see packages/api): what is stored, who it is sent to, when credits
// come back. Change the product and these change with it. The Vietnamese text is the one that binds;
// the English is a translation.

export type LegalDoc = {
  title: string
  updated: string
  intro: string
  sections: Array<{ heading: string; body: string[] }>
}

export const LEGAL_IDS = ["terms", "privacy", "refund"] as const
export type LegalID = (typeof LEGAL_IDS)[number]

const UPDATED = "2026-11-21"

export const LEGAL: Record<LegalID, Record<Locale, LegalDoc>> = {
  terms: {
    vi: {
      title: "Điều khoản sử dụng",
      updated: UPDATED,
      intro: `Khi tạo tài khoản hoặc dùng ${BRAND}, bạn đồng ý với các điều khoản dưới đây. Nếu không đồng ý, vui lòng không dùng dịch vụ.`,
      sections: [
        {
          heading: "1. Dịch vụ",
          body: [
            `${BRAND} là công cụ tạo, sửa ảnh và làm video bằng trí tuệ nhân tạo, chạy trên website amberpix.com. Bạn mô tả bằng chữ hoặc đưa ảnh tham chiếu, hệ thống gửi yêu cầu tới các mô hình AI của bên thứ ba và trả kết quả về tài khoản của bạn.`,
            "Kết quả do AI tạo ra có thể không chính xác, không giống mô tả hoàn toàn, hoặc giống với kết quả của người khác. Bạn tự kiểm tra trước khi dùng.",
          ],
        },
        {
          heading: "2. Tài khoản",
          body: [
            "Bạn cần đủ 16 tuổi, dùng email thật của mình và giữ kín mật khẩu. Bạn chịu trách nhiệm về mọi hoạt động trong tài khoản.",
            "Mỗi người một tài khoản dùng thử. Tài khoản tạo hàng loạt để lấy credit dùng thử có thể bị khoá.",
          ],
        },
        {
          heading: "3. Gói và credit",
          body: [
            "Mỗi lượt tạo trừ một số credit, hiển thị trước khi bạn bấm tạo. Gói trả theo tháng bằng chuyển khoản ngân hàng và không tự gia hạn: hết 30 ngày, tài khoản trở về gói miễn phí cho tới khi bạn mua tiếp.",
            "Credit của gói hết hạn khi kỳ 30 ngày kết thúc. Credit mua thêm có hạn 90 ngày. Credit dùng thử có hạn 14 ngày. Credit không quy đổi thành tiền và không chuyển cho tài khoản khác.",
            "Lượt tạo thất bại do hệ thống hoặc do mô hình từ chối được hoàn credit tự động. Chi tiết ở Chính sách hoàn tiền.",
          ],
        },
        {
          heading: "4. Nội dung không được phép",
          body: [
            "Bạn không dùng dịch vụ để tạo: nội dung khiêu dâm hoặc tình dục liên quan tới trẻ em dưới bất kỳ hình thức nào; hình ảnh khoả thân hoặc tình dục của người thật khi không có sự đồng ý của họ; nội dung giả mạo người thật nhằm lừa đảo, bôi nhọ hoặc gây hiểu lầm; nội dung kích động bạo lực, thù ghét; nội dung vi phạm pháp luật Việt Nam.",
            "Mọi mô tả được kiểm tra tự động trước khi chạy. Yêu cầu bị từ chối không bị trừ credit. Vi phạm lặp lại hoặc nghiêm trọng có thể dẫn tới khoá tài khoản mà không hoàn tiền.",
          ],
        },
        {
          heading: "5. Ảnh của người thật",
          body: [
            "Khi tải lên ảnh có khuôn mặt người, bạn cam kết đó là ảnh của chính bạn hoặc bạn đã được người trong ảnh đồng ý. Bạn chịu trách nhiệm trước người đó và trước pháp luật về việc sử dụng hình ảnh của họ.",
          ],
        },
        {
          heading: "6. Quyền đối với nội dung",
          body: [
            `Ảnh và mô tả bạn đưa lên vẫn là của bạn. Trong phạm vi pháp luật cho phép, ${BRAND} không đòi quyền sở hữu đối với ảnh và video bạn tạo ra; bạn được dùng chúng cho mục đích cá nhân và thương mại.`,
            "Pháp luật về quyền tác giả đối với nội dung do AI tạo chưa rõ ràng ở nhiều nơi, và các mô hình có điều khoản riêng. Chúng tôi không bảo đảm kết quả được bảo hộ quyền tác giả, cũng không bảo đảm nó không giống tác phẩm hay nhãn hiệu của người khác. Bạn tự chịu trách nhiệm khi dùng tên thương hiệu, nhân vật hoặc hình ảnh của bên thứ ba.",
            `Bạn cho phép ${BRAND} lưu trữ và xử lý nội dung của bạn để cung cấp dịch vụ. Chúng tôi không dùng ảnh của bạn để quảng cáo khi chưa hỏi bạn.`,
          ],
        },
        {
          heading: "7. Ghi nhãn nội dung AI",
          body: [
            "Khi đăng ảnh hoặc video trông như thật lên mạng xã hội hoặc dùng trong quảng cáo, bạn có trách nhiệm ghi nhãn đó là nội dung do AI tạo theo quy định của nền tảng và của pháp luật.",
          ],
        },
        {
          heading: "8. Giới hạn trách nhiệm",
          body: [
            "Dịch vụ được cung cấp theo hiện trạng. Chúng tôi cố gắng giữ hệ thống ổn định nhưng không cam kết hoạt động liên tục, vì dịch vụ phụ thuộc vào các nhà cung cấp mô hình bên ngoài.",
            `Trong phạm vi pháp luật cho phép, trách nhiệm của ${BRAND} đối với mọi thiệt hại phát sinh từ việc dùng dịch vụ không vượt quá số tiền bạn đã trả trong 30 ngày gần nhất.`,
          ],
        },
        {
          heading: "9. Thay đổi và chấm dứt",
          body: [
            "Bạn có thể ngừng dùng và yêu cầu xoá tài khoản bất cứ lúc nào. Chúng tôi có thể thay đổi giá, mô hình và các điều khoản này; thay đổi quan trọng sẽ được báo trên website trước khi có hiệu lực, và không áp dụng lùi cho gói bạn đã trả.",
          ],
        },
        {
          heading: "10. Liên hệ và luật áp dụng",
          body: [
            `Các điều khoản này theo pháp luật Việt Nam. Mọi câu hỏi và khiếu nại, vui lòng gửi qua trang Hỗ trợ (${SUPPORT_URL}); chúng tôi trả lời trong 3 ngày làm việc.`,
          ],
        },
      ],
    },
    en: {
      title: "Terms of use",
      updated: UPDATED,
      intro: `By creating an account or using ${BRAND} you agree to these terms. The Vietnamese version is the binding one; this is a translation.`,
      sections: [
        {
          heading: "1. The service",
          body: [
            `${BRAND} makes and edits pictures and makes short clips with AI, at amberpix.com. Your request is sent to third-party AI models and the result is returned to your account.`,
            "AI results can be inaccurate, differ from your description, or resemble someone else's result. Check them before you use them.",
          ],
        },
        {
          heading: "2. Accounts",
          body: [
            "You must be at least 16, use your own email and keep your password private. You are responsible for what happens in your account. One trial account per person.",
          ],
        },
        {
          heading: "3. Plans and credits",
          body: [
            "Each run costs credits, shown before you start it. Plans are paid monthly by bank transfer and do not renew by themselves: after 30 days the account returns to the free plan.",
            "Plan credits expire when the 30 days end, extra credits after 90 days, trial credits after 14 days. Credits cannot be exchanged for money or moved to another account. A failed run gets its credits back automatically.",
          ],
        },
        {
          heading: "4. Content that is not allowed",
          body: [
            "No sexual content involving minors of any kind; no nude or sexual images of real people without their consent; no impersonation of real people to deceive or defame; no incitement to violence or hatred; nothing unlawful in Vietnam.",
            "Every prompt is screened before it runs. A refused request costs nothing. Repeated or serious violations can lead to the account being closed without a refund.",
          ],
        },
        {
          heading: "5. Photos of real people",
          body: [
            "When you upload a photo showing a face, you confirm it is your own or that the person agreed. You answer to them and to the law for how their image is used.",
          ],
        },
        {
          heading: "6. Rights in content",
          body: [
            `What you upload stays yours. As far as the law allows, ${BRAND} claims no ownership of what you make; you may use it personally and commercially.`,
            "Copyright in AI output is unsettled in many places and the models have terms of their own. We do not promise that a result is protected by copyright or that it resembles no one else's work or trademark.",
            `You let ${BRAND} store and process your content to provide the service. We do not use your pictures in advertising without asking you.`,
          ],
        },
        {
          heading: "7. Labelling AI content",
          body: [
            "When you post realistic pictures or clips on social media or use them in advertising, labelling them as AI-generated under the platform's rules and the law is your responsibility.",
          ],
        },
        {
          heading: "8. Limits of liability",
          body: [
            "The service is provided as it is. It depends on outside model providers, so we do not promise it is always available.",
            `As far as the law allows, ${BRAND}'s liability for any loss from using the service is limited to what you paid in the last 30 days.`,
          ],
        },
        {
          heading: "9. Changes and ending",
          body: [
            "You may stop and ask for your account to be deleted at any time. We may change prices, models and these terms; important changes are announced on the website first and do not reach back into a plan you already paid for.",
          ],
        },
        {
          heading: "10. Contact and law",
          body: [
            `These terms follow the law of Vietnam. Questions and complaints: the Support page (${SUPPORT_URL}); we answer within 3 working days.`,
          ],
        },
      ],
    },
  },
  privacy: {
    vi: {
      title: "Chính sách quyền riêng tư",
      updated: UPDATED,
      intro: `Trang này nói rõ ${BRAND} thu thập dữ liệu gì, dùng để làm gì, gửi cho ai và bạn có quyền gì.`,
      sections: [
        {
          heading: "1. Dữ liệu chúng tôi lưu",
          body: [
            "Tài khoản: địa chỉ email và mật khẩu đã được băm (chúng tôi không biết mật khẩu của bạn). Mỗi phiên đăng nhập lưu địa chỉ IP và loại trình duyệt để bạn và chúng tôi nhận ra đăng nhập lạ.",
            "Nội dung: mô tả bạn viết, ảnh tham chiếu bạn tải lên, nhân vật và bối cảnh bạn lưu, tin nhắn với trợ lý, cùng ảnh và video được tạo ra.",
            "Thanh toán: đơn hàng, mã chuyển khoản, số tiền và nội dung chuyển khoản do ngân hàng báo về. Chúng tôi không lưu số thẻ hay thông tin đăng nhập ngân hàng của bạn.",
            "Kỹ thuật: nhật ký hệ thống và số liệu truy cập tổng hợp của Cloudflare, không dùng cookie quảng cáo. Cookie duy nhất của chúng tôi là cookie đăng nhập.",
          ],
        },
        {
          heading: "2. Dùng để làm gì",
          body: [
            "Để tạo ảnh và video theo yêu cầu của bạn, tính credit, kích hoạt gói, gửi mã xác minh qua email, hỗ trợ khi bạn liên hệ, ngăn lạm dụng và làm đúng nghĩa vụ pháp luật.",
            "Chúng tôi không bán dữ liệu của bạn và không dùng ảnh, mô tả của bạn để huấn luyện mô hình AI của riêng mình.",
          ],
        },
        {
          heading: "3. Gửi cho ai",
          body: [
            "Nhà cung cấp mô hình AI: mô tả và ảnh tham chiếu của mỗi lượt tạo được gửi qua OpenRouter tới nhà cung cấp mô hình bạn chọn (như Google, OpenAI, Black Forest Labs, Alibaba, MiniMax, ByteDance) để xử lý. Các bên này đặt máy chủ ở nước ngoài và có chính sách riêng về việc lưu giữ dữ liệu.",
            "Hạ tầng: Cloudflare lưu trữ cơ sở dữ liệu, tệp ảnh và video, và gửi email xác minh. SePay báo cho chúng tôi các khoản chuyển tới tài khoản nhận tiền để kích hoạt đơn.",
            "Cơ quan nhà nước có thẩm quyền, khi pháp luật yêu cầu.",
            "Như vậy dữ liệu của bạn, gồm cả ảnh khuôn mặt nếu bạn tải lên, có thể được chuyển ra ngoài Việt Nam để xử lý. Khi dùng dịch vụ, bạn đồng ý với việc chuyển dữ liệu này.",
          ],
        },
        {
          heading: "4. Ảnh khuôn mặt",
          body: [
            "Ảnh khuôn mặt là dữ liệu nhạy cảm. Chỉ tải lên ảnh của chính bạn hoặc của người đã đồng ý. Ảnh tham chiếu không được dùng trong lượt tạo nào sẽ tự xoá sau 7 ngày. Ảnh của nhân vật đã lưu được giữ cho tới khi bạn xoá nhân vật đó.",
          ],
        },
        {
          heading: "5. Lưu trong bao lâu",
          body: [
            "Ảnh, video và mô tả được giữ cho tới khi bạn xoá chúng hoặc xoá tài khoản. Khi bạn xoá một lượt tạo, tệp của nó bị xoá khỏi kho lưu trữ. Bản ghi thanh toán được giữ theo thời hạn pháp luật về kế toán và thuế yêu cầu.",
          ],
        },
        {
          heading: "6. Quyền của bạn",
          body: [
            `Bạn có quyền biết, xem, sửa, lấy bản sao, hạn chế xử lý, rút lại sự đồng ý và yêu cầu xoá dữ liệu của mình. Bạn tự xoá được từng ảnh, nhân vật, bối cảnh và dự án trong ứng dụng. Để xoá toàn bộ tài khoản hoặc thực hiện các quyền khác, gửi yêu cầu qua trang Hỗ trợ (${SUPPORT_URL}) với email đã đăng ký; chúng tôi xử lý trong 7 ngày làm việc.`,
          ],
        },
        {
          heading: "7. Bảo mật",
          body: [
            "Kết nối được mã hoá. Mật khẩu được băm. Ảnh và video của bạn chỉ tải được khi đã đăng nhập đúng tài khoản. Đổi hoặc đặt lại mật khẩu sẽ đăng xuất các thiết bị khác. Không hệ thống nào an toàn tuyệt đối; nếu xảy ra sự cố ảnh hưởng tới dữ liệu của bạn, chúng tôi sẽ thông báo theo quy định.",
          ],
        },
        {
          heading: "8. Trẻ em",
          body: [
            "Dịch vụ không dành cho người dưới 16 tuổi. Chúng tôi xoá tài khoản khi biết người dùng chưa đủ tuổi.",
          ],
        },
        {
          heading: "9. Liên hệ",
          body: [`Câu hỏi về dữ liệu cá nhân: trang Hỗ trợ (${SUPPORT_URL}).`],
        },
      ],
    },
    en: {
      title: "Privacy policy",
      updated: UPDATED,
      intro: `What ${BRAND} collects, what it is used for, who receives it and what your rights are. The Vietnamese version is the binding one.`,
      sections: [
        {
          heading: "1. What we store",
          body: [
            "Account: your email and a hashed password (we never know the password itself). Each sign-in stores an IP address and browser type.",
            "Content: prompts, reference photos, saved characters and locations, assistant messages, and the pictures and clips made.",
            "Payments: orders, transfer codes, amounts and the transfer note reported by the bank. No card numbers or bank logins.",
            "Technical: system logs and Cloudflare's aggregate traffic figures. No advertising cookies; our only cookie is the sign-in cookie.",
          ],
        },
        {
          heading: "2. What it is used for",
          body: [
            "To make what you ask for, count credits, activate plans, send verification codes, support you, prevent abuse and meet legal duties. We do not sell your data and do not train our own AI models on it.",
          ],
        },
        {
          heading: "3. Who receives it",
          body: [
            "AI model providers: each run's prompt and reference photos go through OpenRouter to the provider of the model you chose (such as Google, OpenAI, Black Forest Labs, Alibaba, MiniMax, ByteDance). They are outside Vietnam and have retention policies of their own.",
            "Infrastructure: Cloudflare hosts the database, the files and sends verification email. SePay reports incoming bank transfers so orders can be activated.",
            "Your data, face photos included if you upload them, may therefore be processed outside Vietnam. By using the service you agree to this transfer.",
          ],
        },
        {
          heading: "4. Face photos",
          body: [
            "Face photos are sensitive data. Upload only your own or those of people who agreed. A reference photo no run used is deleted after 7 days. A saved character's photos stay until you delete the character.",
          ],
        },
        {
          heading: "5. How long",
          body: [
            "Pictures, clips and prompts stay until you delete them or your account. Payment records are kept as long as accounting and tax law requires.",
          ],
        },
        {
          heading: "6. Your rights",
          body: [
            `You may see, correct, copy, restrict, withdraw consent for and delete your data. You can delete pictures, characters, locations and projects in the app. To delete the whole account, write through the Support page (${SUPPORT_URL}) with your registered email; we act within 7 working days.`,
          ],
        },
        {
          heading: "7. Security",
          body: [
            "Connections are encrypted and passwords hashed. Your files load only when signed in to your account. Changing or resetting the password signs other devices out.",
          ],
        },
        { heading: "8. Children", body: ["The service is not for people under 16."] },
        { heading: "9. Contact", body: [`Questions about personal data: the Support page (${SUPPORT_URL}).`] },
      ],
    },
  },
  refund: {
    vi: {
      title: "Chính sách hoàn tiền",
      updated: UPDATED,
      intro: "Trang này nói rõ khi nào credit được hoàn và khi nào tiền được hoàn.",
      sections: [
        {
          heading: "1. Hoàn credit tự động",
          body: [
            "Lượt tạo thất bại (lỗi hệ thống, mô hình quá tải hoặc từ chối, quá thời gian chờ) được hoàn đủ credit ngay, không cần yêu cầu. Lượt tạo nhiều ảnh mà chỉ ra một phần thì hoàn credit cho những ảnh không ra.",
            "Mô tả bị chặn ở bước kiểm tra nội dung không bị trừ credit.",
            "Ảnh hoặc video đã tạo xong nhưng không đúng ý không được hoàn credit, vì chi phí chạy mô hình đã phát sinh. Hãy dùng mức chất lượng thấp để thử ý tưởng trước.",
          ],
        },
        {
          heading: "2. Hoàn tiền gói và credit mua thêm",
          body: [
            "Trong 7 ngày kể từ khi thanh toán, nếu bạn đã dùng không quá 10 credit của lần mua đó, bạn được hoàn 100% số tiền. Gói sẽ bị huỷ và số credit còn lại của lần mua bị thu hồi.",
            "Sau 7 ngày, hoặc khi đã dùng quá 10 credit, khoản thanh toán không được hoàn. Gói không tự gia hạn nên bạn không bị trừ tiền lần nào ngoài những lần bạn tự chuyển khoản.",
          ],
        },
        {
          heading: "3. Chuyển khoản nhầm",
          body: [
            "Nếu bạn chuyển thừa tiền, chuyển hai lần cho cùng một đơn, hoặc chuyển thiếu, hãy liên hệ: chúng tôi hoàn phần thừa hoặc hướng dẫn chuyển bù. Đơn chuyển thiếu được giữ ở trạng thái chờ xử lý, không bị mất.",
            "Chuyển khoản tới sau khi đơn hết hạn 24 giờ vẫn được ghi nhận và kích hoạt.",
          ],
        },
        {
          heading: "4. Cách yêu cầu",
          body: [
            `Gửi yêu cầu qua trang Hỗ trợ (${SUPPORT_URL}) với email đã đăng ký, kèm mã chuyển khoản (bắt đầu bằng KW) và số tài khoản nhận hoàn tiền. Chúng tôi trả lời trong 3 ngày làm việc và chuyển khoản hoàn trong 7 ngày làm việc sau khi chấp nhận.`,
          ],
        },
        {
          heading: "5. Trường hợp không hoàn",
          body: ["Tài khoản bị khoá do vi phạm Điều khoản sử dụng không được hoàn tiền."],
        },
      ],
    },
    en: {
      title: "Refund policy",
      updated: UPDATED,
      intro: "When credits come back and when money comes back. The Vietnamese version is the binding one.",
      sections: [
        {
          heading: "1. Credits returned automatically",
          body: [
            "A failed run (a system error, an overloaded or refusing model, a timeout) gets all its credits back at once. A run that made only some of its pictures gets back the credits for the missing ones.",
            "A prompt stopped by the content check costs nothing.",
            "A finished picture or clip that is not what you hoped for is not refunded, because the model has already been paid for.",
          ],
        },
        {
          heading: "2. Money back for plans and extra credits",
          body: [
            "Within 7 days of paying, if you used no more than 10 credits of that purchase, you get 100% back. The plan is cancelled and the purchase's remaining credits are withdrawn.",
            "After 7 days, or past 10 credits, the payment is not refunded. Plans never renew by themselves.",
          ],
        },
        {
          heading: "3. Transfer mistakes",
          body: [
            "If you paid too much, twice, or too little, write to us: we return the extra or tell you how to complete it. A transfer that lands after the order's 24 hours still counts.",
          ],
        },
        {
          heading: "4. How to ask",
          body: [
            `Write through the Support page (${SUPPORT_URL}) with your registered email, giving the transfer code (it starts with KW) and the account to refund to. We answer within 3 working days and pay within 7 working days of accepting.`,
          ],
        },
        { heading: "5. No refund", body: ["An account closed for breaking the Terms of use is not refunded."] },
      ],
    },
  },
}
