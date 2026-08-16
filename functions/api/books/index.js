// GET /api/books  — 列出可用词书（系统公开 + 当前用户自建），含词数/已掌握数
import { getAuthUser, json } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const payload = await getAuthUser(request, env);
  const userId = payload?.sub || null;
  const db = env.DB;

  const books = userId
    ? await db.prepare('SELECT slug, name, cover, is_public, owner_id FROM books WHERE is_public = 1 OR owner_id = ? ORDER BY is_public DESC, name')
        .bind(userId).all()
    : await db.prepare('SELECT slug, name, cover, is_public, owner_id FROM books WHERE is_public = 1 ORDER BY name').all();

  // 每本书单词总数
  const counts = await db.prepare('SELECT book_slug, COUNT(*) AS c FROM words GROUP BY book_slug').all();
  const countMap = {};
  (counts.results || []).forEach(r => countMap[r.book_slug] = r.c);

  // 当前用户已掌握数（按词书聚合）
  let masteredMap = {};
  if (userId) {
    const m = await db.prepare(`
      SELECT w.book_slug, COUNT(*) AS c
      FROM user_word_status s JOIN words w ON w.slug = s.word_slug
      WHERE s.user_id = ? AND s.status = 'mastered'
      GROUP BY w.book_slug`).bind(userId).all();
    (m.results || []).forEach(r => masteredMap[r.book_slug] = r.c);
  }

  const list = (books.results || []).map(b => ({
    slug: b.slug,
    name: b.name,
    cover: b.cover,
    isPublic: !!b.is_public,
    isOwner: userId && b.owner_id === userId,
    wordCount: countMap[b.slug] || 0,
    masteredCount: masteredMap[b.slug] || 0,
  }));

  return json({ books: list });
}
