// GET /api/config  — 返回前端所需的公开配置（不含任何密钥）
export async function onRequestGet({ env }) {
  // 从 D1 读取站点设置（表不存在时不阻塞，降级为默认值）
  let site = {};
  try {
    const result = await env.DB.prepare('SELECT key, value FROM sys_config').all();
    for (const row of result.results || []) site[row.key] = row.value;
  } catch { /* sys_config 表不存在（未执行新 schema），降级 */ }

  return new Response(JSON.stringify({
    turnstileEnabled: !!env.TURNSTILE_SECRET,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
    siteName: site.site_name || '单词书库',
    allowRegister: site.allow_register !== '0',    // 默认允许
    maintenanceMode: site.maintenance_mode === '1', // 默认非维护
    guestBrowse: site.guest_browse !== '0',         // 默认允许游客
    announcement: site.announcement || '',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
