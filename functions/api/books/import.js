// POST /api/books/import  — 用户自建词书（自己导入单词）
// Body: { name: "我的词书", cover?: "", words: [{ word, meaning, phonetic?, phoneticUs?, phoneticUk?, pos?, example? }] }
import { getAuthUser, json } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const payload = await getAuthUser(request, env);
  if (!payload) return json({ error: '请先登录后再导入单词' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const name = (body.name || '').trim();
  const words = Array.isArray(body.words) ? body.words : [];
  if (!name) return json({ error: '请填写词书名' }, 400);
  if (!words.length) return json({ error: '请至少提供一个单词' }, 400);
  if (words.length > 2000) return json({ error: '单次最多导入 2000 个单词' }, 400);

  const db = env.DB;
  const slug = 'u' + payload.sub + '_' + Date.now().toString(36);
  await db.prepare(
    'INSERT INTO books (slug, name, cover, is_public, owner_id) VALUES (?, ?, ?, 0, ?)'
  ).bind(slug, name, body.cover || '', payload.sub).run();

  let inserted = 0;
  for (let i = 0; i < words.length; i += 100) {
    const chunk = words.slice(i, i + 100);
    const vals = [];
    const args = [];
    chunk.forEach((w, idx) => {
      if (!w || !w.word) return;
      vals.push('(?,?,?,?,?,?,?,?)');
      args.push(
        slug,
        slug + '_' + i + '_' + idx,
        String(w.word).trim(),
        w.pos || '',
        w.phoneticUs || w.phonetic || '',
        w.phoneticUk || '',
        String(w.meaning || '').trim(),
        String(w.example || '').trim()
      );
      inserted++;
    });
    if (vals.length) {
      await db.prepare(
        'INSERT OR IGNORE INTO words (book_slug, slug, word, pos, phonetic_us, phonetic_uk, meaning, example) VALUES ' + vals.join(',')
      ).bind(...args).run();
    }
  }

  return json({ ok: true, slug, name, count: inserted });
}
