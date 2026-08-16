// GET /api/progress  — 当前用户全局学习统计（基于新模型）
import { getAuthUser, json } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const payload = await getAuthUser(request, env);
  if (!payload) return json({ error: '未登录' }, 401);
  const db = env.DB;
  const row = await db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status='mastered' THEN 1 ELSE 0 END) AS mastered,
      SUM(CASE WHEN status='learning' THEN 1 ELSE 0 END) AS learning,
      SUM(CASE WHEN status='new' THEN 1 ELSE 0 END) AS new
    FROM user_word_status WHERE user_id = ?
  `).bind(payload.sub).first();
  return json({
    progress: {
      total: row?.total || 0,
      mastered: row?.mastered || 0,
      learning: row?.learning || 0,
      new: row?.new || 0
    }
  });
}
