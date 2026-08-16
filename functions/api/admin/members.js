// GET /api/admin/members  （仅管理员）— 会员学习统计
import { getAuthUser, json } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const payload = await getAuthUser(request, env);
  if (!payload) return json({ error: '未登录' }, 401);
  if (payload.role !== 'admin') return json({ error: '权限不足' }, 403);

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
