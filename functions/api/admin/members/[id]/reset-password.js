// POST /api/admin/members/:id/reset-password  — 管理员重置用户密码，仅管理员
import { requireAdmin, hashPasswordWithSalt, json } from '../../../../_lib/auth.js';

export async function onRequestPost({ request, env, params }) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: '权限不足' }, 403);

  const id = Number(params.id);
  if (!id || Number.isNaN(id)) return json({ error: '无效的用户 ID' }, 400);

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
  const { password } = body;
  if (!password || password.length < 6) return json({ error: '新密码至少 6 位' }, 400);

  const db = env.DB;
  const target = await db.prepare('SELECT id FROM users WHERE id = ?').bind(id).first();
  if (!target) return json({ error: '用户不存在' }, 404);

  const password_hash = await hashPasswordWithSalt(password);
  await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(password_hash, id).run();
  return json({ ok: true });
}
