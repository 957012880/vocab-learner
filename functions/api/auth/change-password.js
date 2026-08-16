// PUT /api/auth/change-password
// 修改密码（需要验证当前密码 + 邮箱验证码）
import { requireAuth, json, hashPasswordWithSalt, verifyPassword } from '../../_lib/auth.js';

export async function onRequestPut({ request, env }) {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: '未登录或登录已过期' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const { currentPassword, newPassword, emailCode } = body;

  if (!currentPassword) return json({ error: '当前密码不能为空' }, 400);
  if (!newPassword || newPassword.length < 6) return json({ error: '新密码至少 6 位' }, 400);
  if (newPassword === currentPassword) return json({ error: '新密码不能与当前密码相同' }, 400);
  if (!emailCode || typeof emailCode !== 'string') return json({ error: '邮箱验证码不能为空' }, 400);

  const db = env.DB;
  const now = new Date().toISOString();

  // 验证当前密码
  const isCurrentPwCorrect = await verifyPassword(currentPassword, user.password_hash);
  if (!isCurrentPwCorrect) return json({ error: '当前密码错误' }, 401);

  // 验证邮箱验证码（必须是未过期的 email_verify token）
  const token = await db.prepare(
    `SELECT id FROM auth_tokens
     WHERE user_id = ? AND type = 'email_verify' AND code = ? AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`
  ).bind(user.id, emailCode.trim(), now).first();

  if (!token) return json({ error: '邮箱验证码不存在、错误或已过期' }, 400);

  // 更新密码，并删除已使用的 token
  const password_hash = await hashPasswordWithSalt(newPassword);
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?')
    .bind(password_hash, user.id).run();
  await db.prepare('DELETE FROM auth_tokens WHERE id = ?').bind(token.id).run();

  return json({ ok: true, message: '密码修改成功' });
}
