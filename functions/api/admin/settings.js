import { requireAdmin, json } from '../../_lib/auth.js';

// GET  —— 获取全部设置（管理员）
// POST —— 更新设置（管理员），body 为 { key: value, ... }
export async function onRequestGet({ request, env }) {
  const user = await requireAdmin(request, env);
  if (!user) return json({ error: '无权限' }, 403);

  const result = await env.DB.prepare('SELECT key, value FROM sys_config').all();
  const settings = {};
  for (const row of result.results || []) {
    settings[row.key] = row.value;
  }
  return json({ settings });
}

export async function onRequestPost({ request, env }) {
  const user = await requireAdmin(request, env);
  if (!user) return json({ error: '无权限' }, 403);

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const allowed = [
    'site_name', 'allow_register', 'maintenance_mode', 'guest_browse', 'announcement',
    'smtp_host', 'smtp_port', 'smtp_user', 'smtp_password', 'smtp_from', 'smtp_secure',
  ];
  const updates = Object.entries(body).filter(([k]) => allowed.includes(k));
  if (!updates.length) return json({ error: '没有可更新的字段' }, 400);

  const stmt = env.DB.prepare(
    'INSERT INTO sys_config (key, value, updated_at, updated_by) VALUES (?, ?, datetime(\'now\'), ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by'
  );
  const batch = updates.map(([k, v]) => stmt.bind(k, String(v), user.sub));
  await env.DB.batch(batch);

  // 返回更新后的全量设置
  const result = await env.DB.prepare('SELECT key, value FROM sys_config').all();
  const settings = {};
  for (const row of result.results || []) settings[row.key] = row.value;
  return json({ ok: true, settings });
}
