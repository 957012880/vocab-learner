// ============================================================
// SMTP 邮件服务（Cloudflare Workers MVP 版）
// 当前阶段：生成验证码并存入 auth_tokens，日志打印邮件内容，不真正发送
// ============================================================

const crypto = globalThis.crypto;

/**
 * 生成 N 位数字验证码
 */
function generateCode(length = 6) {
  const digits = '0123456789';
  let code = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    code += digits[array[i] % digits.length];
  }
  return code;
}

/**
 * 生成随机 token（base64url）
 */
function generateToken(byteLength = 32) {
  const array = new Uint8Array(byteLength);
  crypto.getRandomValues(array);
  let str = '';
  for (let i = 0; i < array.length; i += 0x8000) {
    str += String.fromCharCode.apply(null, array.subarray(i, i + 0x8000));
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * 构建邮箱验证邮件 HTML 正文
 */
function buildEmailBody(code, subject = '验证你的邮箱') {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family: Arial, sans-serif; background: #f5f5f5; padding: 24px;">
  <div style="max-width: 480px; margin: auto; background: #fff; border-radius: 8px; padding: 32px; box-shadow: 0 2px 8px rgba(0,0,0,.08);">
    <h2 style="color: #333; margin-bottom: 16px;">${subject}</h2>
    <p style="color: #555; line-height: 1.6;">你好！</p>
    <p style="color: #555; line-height: 1.6;">
      你的验证码是：<strong style="font-size: 28px; letter-spacing: 4px; color: #1a73e8;">${code}</strong>
    </p>
    <p style="color: #999; font-size: 12px; margin-top: 24px;">
      此验证码 10 分钟内有效，请勿泄露给他人。
    </p>
  </div>
</body>
</html>`;
}

/**
 * 从 D1 读取 SMTP 配置
 */
async function getSmtpConfig(env) {
  if (!env.DB) return null;
  try {
    const result = await env.DB.prepare(
      "SELECT key, value FROM sys_config WHERE key LIKE 'smtp_%'"
    ).all();
    const config = {};
    for (const row of result.results) {
      config[row.key] = row.value;
    }
    return Object.keys(config).length > 0 ? config : null;
  } catch {
    return null;
  }
}

/**
 * 发送邮件（MVP：记录日志，不真实发送）
 * 后续可接入 SendGrid / Mailgun / SMTP relay 等第三方 API
 */
async function sendMail(to, subject, html, env, _config) {
  console.log(`[SMTP MVP] To: ${to}`);
  console.log(`[SMTP MVP] Subject: ${subject}`);
  console.log(`[SMTP MVP] Body:\n${html}`);
  return { ok: true, message: 'MVP: email logged to console only' };
}

/**
 * 发送邮箱验证邮件
 * 流程：生成验证码 → 存入 auth_tokens → 返回 { code, token }
 */
async function sendVerificationEmail(user, env) {
  const code = generateCode(6);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 分钟

  if (env.DB) {
    await env.DB.prepare(
      `INSERT INTO auth_tokens (user_id, type, code, expires_at)
       VALUES (?, 'email_verify', ?, ?)`
    )
      .bind(user.id, code, expiresAt)
      .run();
  }

  const html = buildEmailBody(code, '验证你的邮箱');
  await sendMail(user.email, '验证你的邮箱', html, env);

  return { code, expiresAt };
}

/**
 * 发送密码重置邮件
 * 流程：生成验证码 → 存入 auth_tokens → 返回 { code, token }
 */
async function sendResetEmail(user, env) {
  const code = generateCode(6);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 分钟

  if (env.DB) {
    await env.DB.prepare(
      `INSERT INTO auth_tokens (user_id, type, code, expires_at)
       VALUES (?, 'password_reset', ?, ?)`
    )
      .bind(user.id, code, expiresAt)
      .run();
  }

  const html = buildEmailBody(code, '重置你的密码');
  await sendMail(user.email, '重置密码', html, env);

  return { code, expiresAt };
}

export {
  generateCode,
  generateToken,
  buildEmailBody,
  getSmtpConfig,
  sendVerificationEmail,
  sendResetEmail,
};
