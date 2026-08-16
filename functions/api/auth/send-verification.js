// POST /api/auth/send-verification
// 向当前登录用户的邮箱发送 6 位验证码
import { requireAuth, json } from '../../_lib/auth.js';
import { generateCode, buildEmailBody } from '../../_lib/smtp.js';

export async function onRequestPost({ request, env }) {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: '未登录或登录已过期' }, 401);

  const db = env.DB;
  const code = generateCode(6);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 分钟有效

  // 删除该用户所有旧 token，防止重放
  await db.prepare('DELETE FROM auth_tokens WHERE user_id = ?').bind(user.id).run();

  // 插入新 token
  await db.prepare(
    'INSERT INTO auth_tokens (user_id, type, code, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(user.id, 'email_verify', code, expiresAt).run();

  // MVP：打印邮件内容到日志（实际环境接入 SMTP/SendGrid 等）
  const emailBody = buildEmailBody(code, '验证你的邮箱');
  console.log(`[Email] To: ${user.email}, Code: ${code}`);

  return json({ ok: true, message: '验证码已发送至您的邮箱' });
}
