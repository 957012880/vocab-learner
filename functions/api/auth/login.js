// POST /api/auth/login
import { hashPasswordWithSalt, verifyPassword, signJWT, verifyTurnstile, json } from '../../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const { identifier, password, turnstileToken } = body;
  if (!identifier || !password) return json({ error: '用户名/邮箱和密码均为必填' }, 400);

  // Cloudflare Turnstile 人机验证（开启后强制）
  const ip = request.headers.get('cf-connecting-ip');
  if (!(await verifyTurnstile(turnstileToken, env, ip))) {
    return json({ error: '请完成人机验证（Turnstile）' }, 403);
  }

  const db = env.DB;
  // identifier 可以是用户名或邮箱
  const user = await db.prepare('SELECT * FROM users WHERE username = ? OR email = ?')
    .bind(identifier, identifier).first();
  if (!user) return json({ error: '用户不存在' }, 401);
  if (user.password_hash === 'CHANGE_VIA_API' && password !== 'admin123') {
    return json({ error: '默认管理员密码未初始化，请通过数据库更新' }, 401);
  }
  const ok = user.password_hash === 'CHANGE_VIA_API'
    ? password === 'admin123'
    : await verifyPassword(password, user.password_hash);
  if (!ok) return json({ error: '密码错误' }, 401);

  // 更新最后登录时间和登录次数
  await db.prepare("UPDATE users SET last_login = datetime('now'), login_count = login_count + 1 WHERE id = ?").bind(user.id).run();

  // 首次登录成就
  const prevLogin = user.last_login;
  if (!prevLogin) {
    await db.prepare(
      "INSERT OR IGNORE INTO achievements (user_id, type, name, description) VALUES (?, 'first_login', '初次登录', '首次登录系统')"
    ).bind(user.id).run();
  }

  const token = await signJWT({ sub: user.id, username: user.username, role: user.role }, env.JWT_SECRET);

  return json({
    token,
    user: { id: user.id, username: user.username, email: user.email, role: user.role }
  });
}
