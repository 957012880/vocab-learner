// POST /api/auth/send-verification
// 向当前登录用户的邮箱发送 6 位验证码
import { requireAuth, json } from '../../_lib/auth.js';
import { sendCodeMail } from '../../_lib/smtp.js';

export async function onRequestPost({ request, env }) {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: '未登录或登录已过期' }, 401);

  // 若已验证则无需重复发送
  if (user.email_verified) {
    return json({ ok: true, alreadyVerified: true, message: '邮箱已验证' });
  }

  const { devCode } = await sendCodeMail(user, 'email_verify', env);
  return json({ ok: true, devCode: devCode || undefined, message: '验证码已发送，请查收邮件' });
}
