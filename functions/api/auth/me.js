// GET /api/auth/me
import { getAuthUser, json } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const payload = await getAuthUser(request, env);
  if (!payload) return json({ error: '未登录或登录已过期' }, 401);

  const db = env.DB;
  const user = await db.prepare('SELECT id, username, email, role, created_at, last_login FROM users WHERE id = ?')
    .bind(payload.sub).first();
  if (!user) return json({ error: '用户不存在' }, 401);

  return json({ user: { id: user.id, username: user.username, email: user.email, role: user.role, created_at: user.created_at, last_login: user.last_login } });
}
