// GET  /api/auth/profile
// PUT  /api/auth/profile
// 获取/修改个人资料
import { requireAuth, json, hashPasswordWithSalt } from '../../_lib/auth.js';
import { generateCode, buildEmailBody } from '../../_lib/smtp.js';

// ---------- GET ----------
export async function onRequestGet({ request, env }) {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: '未登录或登录已过期' }, 401);

  return json({
    ok: true,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      emailVerified: !!user.email_verified,
      role: user.role,
    }
  });
}

// ---------- PUT ----------
export async function onRequestPut({ request, env }) {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: '未登录或登录已过期' }, 401);

  let body;
  try { body = await request.json(); } catch { return json({ error: '请求格式错误' }, 400); }

  const { username, email } = body || {};
  const db = env.DB;
  const updates = [];
  const binds = [];

  if (username !== undefined) {
    if (typeof username !== 'string' || username.length < 3 || username.length > 20) {
      return json({ error: '用户名需 3-20 个字符' }, 400);
    }
    // 检查用户名是否被其他人占用
    const dup = await db.prepare('SELECT id FROM users WHERE username = ? AND id != ?')
      .bind(username, user.id).first();
    if (dup) return json({ error: '用户名已被占用' }, 409);
    updates.push('username = ?');
    binds.push(username);
  }

  if (email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: '邮箱格式不正确' }, 400);
    }
    // 检查邮箱是否被其他人占用
    const dup = await db.prepare('SELECT id FROM users WHERE email = ? AND id != ?')
      .bind(email, user.id).first();
    if (dup) return json({ error: '邮箱已被注册' }, 409);
    updates.push('email = ?');
    binds.push(email);
    // 变更邮箱后重置验证状态，并重新发送验证邮件
    updates.push('email_verified = 0');
    binds.push(0);

    const code = generateCode(6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    await db.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND type = \'email_verify\'')
      .bind(user.id).run();
    await db.prepare(
      'INSERT INTO auth_tokens (user_id, type, code, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(user.id, 'email_verify', code, expiresAt).run();
    console.log(`[Email] To: ${email}, Code: ${code}`);
  }

  if (updates.length === 0) return json({ error: '没有需要更新的字段' }, 400);

  binds.push(user.id);
  await db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).bind(...binds).run();

  // 返回更新后的用户信息
  const updated = await db.prepare(
    'SELECT id, username, email, role, email_verified FROM users WHERE id = ?'
  ).bind(user.id).first();

  return json({
    ok: true,
    user: {
      id: updated.id,
      username: updated.username,
      email: updated.email,
      emailVerified: !!updated.email_verified,
      role: updated.role,
    }
  });
}
