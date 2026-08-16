// POST /api/auth/verify-email
// 验证邮箱验证码，成功后标记 email_verified = 1
import { requireAuth, json } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: '未登录或登录已过期' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const { code } = body;
  if (!code || typeof code !== 'string') return json({ error: '验证码不能为空' }, 400);

  const db = env.DB;
  const now = new Date().toISOString();

  // 查找该用户最新一条未过期的 email_verify token
  const token = await db.prepare(
    `SELECT id, code FROM auth_tokens
     WHERE user_id = ? AND type = 'email_verify' AND expires_at > ?
     ORDER BY created_at DESC LIMIT 1`
  ).bind(user.id, now).first();

  if (!token) return json({ error: '验证码不存在或已过期，请重新发送' }, 400);

  if (token.code !== code.trim()) return json({ error: '验证码错误' }, 400);

  // 验证成功：标记邮箱已验证，并删除已使用的 token
  await db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').bind(user.id).run();
  await db.prepare('DELETE FROM auth_tokens WHERE id = ?').bind(token.id).run();

  return json({ ok: true, message: '邮箱验证成功' });
}
