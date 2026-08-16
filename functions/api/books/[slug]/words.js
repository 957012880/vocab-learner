// GET /api/books/:slug/words  — 获取某词书的单词列表（分页，客户端循环拉取全部）
// 返回每个单词的当前用户状态 status: new | learning | mastered
import { getAuthUser, json } from '../../../_lib/auth.js';

export async function onRequestGet({ request, env, params }) {
  const slug = params.slug;
  const payload = await getAuthUser(request, env);
  const userId = payload?.sub || null;
  const db = env.DB;

  const book = await db.prepare('SELECT slug, name, cover FROM books WHERE slug = ?').bind(slug).first();
  if (!book) return json({ error: '词书不存在' }, 404);

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '1000'), 2000);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  const wordsRes = await db.prepare(
    'SELECT slug, word, pos, phonetic_us, phonetic_uk, meaning, example FROM words WHERE book_slug = ? ORDER BY id LIMIT ? OFFSET ?'
  ).bind(slug, limit, offset).all();

  const totalRow = await db.prepare('SELECT COUNT(*) AS c FROM words WHERE book_slug = ?').bind(slug).first();
  const total = totalRow?.c || 0;

  let wordList = wordsRes.results || [];
  if (userId && wordList.length) {
    const slugs = wordList.map(w => w.slug);
    const ph = slugs.map(() => '?').join(',');
    const st = await db.prepare(
      `SELECT word_slug, status FROM user_word_status WHERE user_id = ? AND word_slug IN (${ph})`
    ).bind(userId, ...slugs).all();
    const stMap = {};
    (st.results || []).forEach(r => stMap[r.word_slug] = r.status);
    wordList = wordList.map(w => ({ ...w, status: stMap[w.slug] || 'new' }));
  } else {
    wordList = wordList.map(w => ({ ...w, status: 'new' }));
  }

  return json({ book, total, limit, offset, words: wordList });
}
