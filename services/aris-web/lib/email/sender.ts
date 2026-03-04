import nodemailer from 'nodemailer';
import { env } from '@/lib/config';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
  auth: env.SMTP_USER && env.SMTP_PASS ? {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  } : undefined,
});

/**
 * ARIS 인증 코드를 이메일로 전송합니다.
 * @param to 수신자 이메일 주소
 * @param code 6자리 인증 코드
 */
export async function sendVerificationEmail(to: string, code: string): Promise<void> {
  // SMTP 설정이 없으면 콘솔에만 출력 (개발 환경 편의성)
  if (!env.SMTP_HOST) {
    console.log(`[Email Mock] To: ${to}, Verification Code: ${code}`);
    return;
  }

  await transporter.sendMail({
    from: env.SMTP_FROM,
    to,
    subject: '[ARIS] Security Verification Code',
    text: `Your ARIS verification code is: ${code}\n\nThis code will expire in 5 minutes.`,
    html: `
      <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px; max-width: 500px;">
        <h2 style="color: #111827;">Security Verification</h2>
        <p style="color: #4b5563;">Please use the following code to complete your login on a new device.</p>
        <div style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #2563eb; margin: 20px 0; text-align: center;">
          ${code}
        </div>
        <p style="color: #9ca3af; font-size: 14px;">This code will expire in 5 minutes. If you did not request this, please ignore this email.</p>
      </div>
    `,
  });
}
