// DELETE /api/admin/members/:id  — 删除用户，仅管理员
// 保护：不能删除自己；不能删除最后一个管理员。
import { requireAdmin, json } from '../../../_lib/auth.js';

export async function onRequestDelete({ request, env, params }) {
  const payload = await requireAdmin(request, env);
  if (!payload) return json({ error: '权限不足' }, 403);

  const id = Number(params.id);
  if (!id || Number.isNaN(id)) return json({ error: '无效的用户 ID' }, 400);

  const db = env.DB;

  // 不能删除自己
  if (payload.sub === id) return json({ error: '不能删除当前登录的管理员账号' }, 400);

  const target = await db.prepare('SELECT id, role FROM users WHERE id = ?').bind(id).first();
  if (!target) return json({ error: '用户不存在' }, 404);

  // 不能删除最后一个管理员
  if (target.role === 'admin') {
    const adminCount = await db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin'").first();
    if (adminCount.c <= 1) return json({ error: '不能删除最后一个管理员账号' }, 400);
  }

  await db.prepare('DELETE FROM users WHERE id = ?').bind(id).run();
  return json({ ok: true });
}
