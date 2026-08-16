// POST /api/auth/reset-password
// 使用验证码重置密码
import { json, hashPasswordWithSalt } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const { code, password } = body;
  if (!code || typeof code !== 'string') return json({ error: '验证码不能为空' }, 400);
  if (!password || password.length < 6) return json({ error: '密码至少 6 位' }, 400);

  const db = env.DB;
  const now = new Date().toISOString();

  // 查找最新未过期的 password_reset token
  const token = await db.prepare(
    `SELECT user_id FROM auth_tokens
     WHERE type = 'password_reset' AND code = ? AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`
  ).bind(code.trim(), now).first();

  if (!token) return json({ error: '验证码不存在、错误或已过期' }, 400);

  const password_hash = await hashPasswordWithSalt(password);

  // 更新密码，并删除已使用的 token
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(password_hash, token.user_id).run();
  await db.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND type = \'password_reset\'')
    .bind(token.user_id).run();

  return json({ ok: true, message: '密码重置成功，请重新登录' });
}
