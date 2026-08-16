// GET|POST /api/words/:slug/status  — 获取/设置某个单词的学习状态
import { getAuthUser, json } from '../../../_lib/auth.js';

export async function onRequest({ request, env, params }) {
  const payload = await getAuthUser(request, env);
  if (!payload) return json({ error: '请先登录' }, 401);
  const wordSlug = params.slug;
  const db = env.DB;

  if (request.method === 'GET') {
    const row = await db.prepare(
      'SELECT status, answered_count FROM user_word_status WHERE user_id = ? AND word_slug = ?'
    ).bind(payload.sub, wordSlug).first();
    return json({
      status: row?.status || 'new',
      answeredCount: row?.answered_count || 0
    });
  }

  if (request.method === 'POST') {
    let body;
    try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }
    const status = ['new', 'learning', 'familiar', 'mastered'].includes(body.status) ? body.status : 'new';
    const answered = body.answered === true;

    // 如果答对了，递增 answered_count，并根据次数自动升级状态
    let finalStatus = status;
    if (answered) {
      const existing = await db.prepare(
        'SELECT answered_count, status FROM user_word_status WHERE user_id = ? AND word_slug = ?'
      ).bind(payload.sub, wordSlug).first();
      const count = (existing?.answered_count || 0) + 1;
      // 递进式状态：1次→learning, 3次→familiar, 5次→mastered
      if (count >= 5) finalStatus = 'mastered';
      else if (count >= 3) finalStatus = 'familiar';
      else if (count >= 1) finalStatus = 'learning';
      await db.prepare(`
        INSERT INTO user_word_status (user_id, word_slug, status, answered_count, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, word_slug) DO UPDATE SET
          status = excluded.status,
          answered_count = excluded.answered_count,
          updated_at = datetime('now')
      `).bind(payload.sub, wordSlug, finalStatus, count).run();
    } else {
      await db.prepare(`
        INSERT INTO user_word_status (user_id, word_slug, status, answered_count, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(user_id, word_slug) DO UPDATE SET status = excluded.status, updated_at = datetime('now')
      `).bind(payload.sub, wordSlug, finalStatus, 0).run();
    }

    return json({ ok: true, status: finalStatus, answeredCount: answered ? 1 : 0 });
  }

  return json({ error: '方法不允许' }, 405);
}
