// POST /api/auth/forgot-password
// 忘记密码：根据邮箱或用户名查找用户，发送重置验证码
// 无论用户是否存在均返回成功，防止邮箱枚举攻击
import { json } from '../../_lib/auth.js';
import { generateCode, buildEmailBody } from '../../_lib/smtp.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const { identifier } = body;
  if (!identifier || typeof identifier !== 'string') return json({ error: '请输入邮箱或用户名' }, 400);

  const db = env.DB;
  const code = generateCode(6);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 分钟有效

  // 查找用户（允许未登录调用）
  const user = await db.prepare(
    'SELECT id, email FROM users WHERE username = ? OR email = ?'
  ).bind(identifier, identifier).first();

  if (user) {
    // 删除旧 reset token，插入新 token
    await db.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND type = \'password_reset\'')
      .bind(user.id).run();
    await db.prepare(
      'INSERT INTO auth_tokens (user_id, type, code, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(user.id, 'password_reset', code, expiresAt).run();

    // MVP：打印邮件内容到日志
    const emailBody = buildEmailBody(code, '重置你的密码');
    console.log(`[Email] To: ${user.email}, Code: ${code}`);
  }

  // 无论用户是否存在都返回成功（防止枚举攻击）
  return json({ ok: true });
}
