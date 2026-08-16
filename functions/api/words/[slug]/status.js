// GET|POST /api/words/:slug/status  — 获取/设置某个单词的学习状态
// word_slug 为全局唯一词 ID（如 CET4_1_1 或用户自建的 u12_xxx_3）
import { getAuthUser, json } from '../../../_lib/auth.js';

export async function onRequest({ request, env, params }) {
  const payload = await getAuthUser(request, env);
  if (!payload) return json({ error: '请先登录' }, 401);
  const wordSlug = params.slug;
  const db = env.DB;

  if (request.method === 'GET') {
    const row = await db.prepare(
      'SELECT status FROM user_word_status WHERE user_id = ? AND word_slug = ?'
    ).bind(payload.sub, wordSlug).first();
    return json({ status: row?.status || 'new' });
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
    const status = ['new', 'learning', 'mastered'].includes(body.status) ? body.status : 'new';
    await db.prepare(`
      INSERT INTO user_word_status (user_id, word_slug, status, updated_at)
      VALUES (?, ?, ?, datetime('now'))
      ON CONFLICT(user_id, word_slug) DO UPDATE SET status = excluded.status, updated_at = datetime('now')
    `).bind(payload.sub, wordSlug, status).run();
    return json({ ok: true, status });
  }

  return json({ error: '方法不允许' }, 405);
}
