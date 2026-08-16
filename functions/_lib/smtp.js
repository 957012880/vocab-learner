// ============================================================
// SMTP 邮件服务（Cloudflare Pages Functions）
// 支持两种模式：
//   1. 配置了 smtp_* 且 smtp_host 非空 → 通过 Sockets API 真实发送
//   2. 未配置 / 发送失败 → 控制台日志兜底，并返回 devCode 便于本地测试
// ============================================================

import { connect } from 'cloudflare:sockets';

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
 * UTF-8 安全的 base64 编码（用于 SMTP AUTH LOGIN）
 */
function b64(str) {
  try { return btoa(unescape(encodeURIComponent(str))); }
  catch { return btoa(str); }
}

/**
 * 构建邮箱验证邮件 HTML 正文
 */
function buildEmailBody(code, subject = '验证你的邮箱') {
  return `<!DOCTYPE html>
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
 * 从 D1 读取 SMTP 配置，返回标准对象或 null
 */
async function getSmtpConfig(env) {
  if (!env.DB) return null;
  try {
    const result = await env.DB.prepare(
      "SELECT key, value FROM sys_config WHERE key LIKE 'smtp_%'"
    ).all();
    const config = {};
    for (const row of result.results || []) config[row.key] = row.value;
    if (!config.smtp_host) return null;
    return {
      host: config.smtp_host,
      port: parseInt(config.smtp_port, 10) || 587,
      user: config.smtp_user || '',
      pass: config.smtp_password || '',
      from: config.smtp_from || config.smtp_user || '',
      secure: String(config.smtp_secure) === 'true' || config.smtp_port === '465',
    };
  } catch {
    return null;
  }
}

/**
 * 通过 Cloudflare Sockets API 发送 SMTP 邮件（支持 STARTTLS / 隐式 TLS）
 */
async function sendSmtp({ host, port, user, pass, from, to, subject, html, secure }) {
  const socket = connect(`${host}:${port}`, secure ? { secureTransport: 'on' } : {});
  await socket.opened;

  const writer = socket.writable.getWriter();
  const reader = socket.readable.getReader();
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  let buf = '';

  const readLine = async () => {
    while (true) {
      const idx = buf.indexOf('\r\n');
      if (idx >= 0) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        return line;
      }
      const { value, done } = await reader.read();
      if (done) return null;
      buf += dec.decode(value, { stream: true });
    }
  };
  const sendLine = async (cmd) => { await writer.write(enc.encode(cmd + '\r\n')); };
  const readReply = async () => {
    let line = await readLine();
    while (line && line[3] === '-') line = await readLine();
    return line;
  };
  const withTimeout = (p, ms, label) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('SMTP 超时: ' + label)), ms)),
  ]);

  const ehlo = (from.split('@')[1] || 'localhost');

  try {
    let r = await withTimeout(readReply(), 10000, 'banner');
    if (!r || r[0] !== '2') throw new Error('服务器握手失败: ' + r);

    await sendLine('EHLO ' + ehlo);
    r = await withTimeout(readReply(), 10000, 'ehlo1');
    if (!r || r[0] !== '2') throw new Error('EHLO 失败: ' + r);

    if (!secure) {
      await sendLine('STARTTLS');
      r = await withTimeout(readReply(), 10000, 'starttls');
      if (!r || r[0] !== '2') throw new Error('STARTTLS 失败: ' + r);
      await socket.startTls();
      await sendLine('EHLO ' + ehlo);
      r = await withTimeout(readReply(), 10000, 'ehlo2');
      if (!r || r[0] !== '2') throw new Error('STARTTLS 后 EHLO 失败: ' + r);
    }

    if (user && pass) {
      await sendLine('AUTH LOGIN');
      r = await withTimeout(readReply(), 10000, 'auth1');
      await sendLine(b64(user));
      r = await withTimeout(readReply(), 10000, 'auth2');
      await sendLine(b64(pass));
      r = await withTimeout(readReply(), 10000, 'auth3');
      if (!r || r[0] !== '2') throw new Error('SMTP 认证失败: ' + r);
    }

    await sendLine('MAIL FROM:<' + from + '>');
    r = await withTimeout(readReply(), 10000, 'mail');
    if (!r || r[0] !== '2') throw new Error('MAIL FROM 失败: ' + r);

    await sendLine('RCPT TO:<' + to + '>');
    r = await withTimeout(readReply(), 10000, 'rcpt');
    if (!r || r[0] !== '2') throw new Error('RCPT TO 失败: ' + r);

    await sendLine('DATA');
    r = await withTimeout(readReply(), 10000, 'data');
    if (!r || r[0] !== '3') throw new Error('DATA 指令失败: ' + r);

    const safeHtml = String(html)
      .split('\n')
      .map((l) => (l.startsWith('.') ? '.' + l : l))
      .join('\r\n');
    const message = [
      'From: ' + from,
      'To: ' + to,
      'Subject: =?UTF-8?B?' + b64(subject) + '?=',
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
      '',
      safeHtml,
      '.',
    ].join('\r\n');
    await writer.write(enc.encode(message + '\r\n'));
    r = await withTimeout(readReply(), 10000, 'body');
    if (!r || r[0] !== '2') throw new Error('邮件正文发送失败: ' + r);

    await sendLine('QUIT');
    await withTimeout(readReply(), 5000, 'quit');
  } finally {
    try { await writer.close(); } catch {}
  }
}

/**
 * 统一发送验证码邮件：
 *  - 生成 6 位验证码并写入 auth_tokens（先删旧 token 防重放）
 *  - 尝试真实 SMTP 发送；失败则控制台日志兜底
 *  - 若未配置 SMTP，返回 devCode 便于本地/测试环境闭环
 * @returns { code, sent, devCode }
 */
export async function sendCodeMail(user, type, env) {
  const code = generateCode(6);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 分钟

  if (env.DB) {
    await env.DB.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND type = ?')
      .bind(user.id, type).run();
    await env.DB.prepare(
      'INSERT INTO auth_tokens (user_id, type, code, expires_at) VALUES (?, ?, ?, ?)'
    ).bind(user.id, type, code, expiresAt).run();
  }

  const subject = type === 'password_reset' ? '重置你的密码' : '验证你的邮箱';
  const html = buildEmailBody(code, subject);
  const config = await getSmtpConfig(env);

  let sent = false;
  let devCode = null;
  if (config && config.host) {
    try {
      await sendSmtp({ ...config, to: user.email, subject, html });
      sent = true;
      console.log(`[SMTP] 已发送「${subject}」至 ${user.email}`);
    } catch (e) {
      console.error('[SMTP] 发送失败，回退日志：', e.message);
    }
  }
  if (!sent) {
    console.log(`[Email] To: ${user.email}, Subject: ${subject}, Code: ${code}`);
    if (!config || !config.host) devCode = code; // 未配置 SMTP 时暴露验证码便于测试
  }
  return { code, sent, devCode };
}

/** 兼容旧调用：发送邮箱验证邮件 */
export async function sendVerificationEmail(user, env) {
  return sendCodeMail(user, 'email_verify', env);
}
/** 兼容旧调用：发送密码重置邮件 */
export async function sendResetEmail(user, env) {
  return sendCodeMail(user, 'password_reset', env);
}

export {
  generateCode,
  generateToken,
  buildEmailBody,
  getSmtpConfig,
};
