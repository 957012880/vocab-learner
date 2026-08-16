// POST /api/auth/forgot-password
// 忘记密码：根据邮箱或用户名查找用户，发送重置验证码
// 无论用户是否存在均返回成功，防止邮箱枚举攻击
import { json } from '../../_lib/auth.js';
import { sendCodeMail } from '../../_lib/smtp.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const { identifier } = body;
  if (!identifier || typeof identifier !== 'string') return json({ error: '请输入邮箱或用户名' }, 400);

  const db = env.DB;
  // 查找用户（允许未登录调用）
  const user = await db.prepare(
    'SELECT id, email FROM users WHERE username = ? OR email = ?'
  ).bind(identifier, identifier).first();

  if (user) {
    await sendCodeMail(user, 'password_reset', env);
  }

  // 无论用户是否存在都返回成功（防止枚举攻击）
  return json({ ok: true });
}
