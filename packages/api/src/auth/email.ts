import type { Env } from "../env"

export async function sendEmail(env: Env, message: { to: string; subject: string; text: string; html?: string }) {
  // Local dev (`LOG_EMAIL=1` in .dev.vars) prints the message instead of sending so the OTP can
  // be read from the terminal; the local send_email binding has no real outbox anyway.
  if (env.LOG_EMAIL === "1" || !env.EMAIL) {
    console.log(`[email] to=${message.to} subject=${message.subject}\n${message.text}`)
    return
  }
  await env.EMAIL.send({ from: env.EMAIL_FROM, ...message })
}

export function otpEmail(input: { code: string; purpose: "signup" | "reset" }) {
  const title = input.purpose === "signup" ? "Xác minh email Kiwii" : "Đặt lại mật khẩu Kiwii"
  const lead =
    input.purpose === "signup"
      ? "Nhập mã dưới đây để hoàn tất đăng ký tài khoản Kiwii."
      : "Nhập mã dưới đây để đặt lại mật khẩu Kiwii của bạn."
  const text = `${title}\n\n${lead}\n\nMã của bạn: ${input.code}\n\nMã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.`
  const html = `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
  <h2 style="margin:0 0 12px">${title}</h2>
  <p>${lead}</p>
  <p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:24px 0">${input.code}</p>
  <p style="color:#666">Mã có hiệu lực trong 10 phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
</div>`
  return {
    subject: `${input.code} là mã ${input.purpose === "signup" ? "xác minh" : "đặt lại mật khẩu"} Kiwii`,
    text,
    html,
  }
}
