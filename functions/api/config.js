// GET /api/config  — 返回前端所需的公开配置（不含任何密钥）
export async function onRequestGet({ env }) {
  return new Response(JSON.stringify({
    turnstileEnabled: !!env.TURNSTILE_SECRET,
    turnstileSiteKey: env.TURNSTILE_SITE_KEY || '',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
