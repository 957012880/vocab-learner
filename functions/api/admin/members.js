// /api/admin/members
// GET  — 会员列表（含学习统计），仅管理员
// POST — 新增用户（管理员后台创建），仅管理员
import { requireAdmin, hashPasswordWithSalt, json } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: '权限不足' }, 403);

  const db = env.DB;
  const rows = await db.prepare(`
    SELECT u.id, u.username, u.email, u.role, u.created_at, u.last_login,
           COUNT(s.word_slug) AS word_count,
           SUM(CASE WHEN s.status='mastered' THEN 1 ELSE 0 END) AS mastered_count
    FROM users u
    LEFT JOIN user_word_status s ON s.user_id = u.id
    GROUP BY u.id
    ORDER BY u.created_at DESC
  `).all();

  return json({ members: rows.results || [] });
}

export async function onRequestPost({ request, env }) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: '权限不足' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const { username, email, password, role } = body;
  if (!username || !email || !password) return json({ error: '用户名、邮箱、密码均为必填' }, 400);
  if (username.length < 3 || username.length > 20) return json({ error: '用户名需 3-20 个字符' }, 400);
  if (password.length < 6) return json({ error: '密码至少 6 位' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: '邮箱格式不正确' }, 400);
  const safeRole = role === 'admin' ? 'admin' : 'member';

  const db = env.DB;
  const exists = await db.prepare('SELECT id FROM users WHERE username = ? OR email = ?')
    .bind(username, email).first();
  if (exists) return json({ error: '用户名或邮箱已被占用' }, 409);

  const password_hash = await hashPasswordWithSalt(password);
  const info = await db.prepare(
    'INSERT INTO users (username, email, password_hash, role) VALUES (?, ?, ?, ?)'
  ).bind(username, email, password_hash, safeRole).run();

  const userId = info.meta?.last_row_id;
  return json({
    user: { id: userId, username, email, role: safeRole }
  }, 201);
}
