// POST /api/auth/register
import { hashPasswordWithSalt, signJWT, json } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const { username, email, password } = body;
  if (!username || !email || !password) return json({ error: '用户名、邮箱、密码均为必填' }, 400);
  if (username.length < 3 || username.length > 20) return json({ error: '用户名需 3-20 个字符' }, 400);
  if (password.length < 6) return json({ error: '密码至少 6 位' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: '邮箱格式不正确' }, 400);

  const db = env.DB;
  // 唯一性校验
  const exists = await db.prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .bind(username, email).first();
  if (exists) return json({ error: '用户名或邮箱已被注册' }, 409);

  const password_hash = await hashPasswordWithSalt(password);
  const info = await db.prepare(
    'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).bind(username, email, password_hash, 'member').run();

  const userId = info.meta?.last_row_id;
  const token = await signJWT({ sub: userId, username, role: 'member' }, env.JWT_SECRET);

  return json({
    token,
    user: { id: userId, username, email, role: 'member' }
  }, 201);
}
