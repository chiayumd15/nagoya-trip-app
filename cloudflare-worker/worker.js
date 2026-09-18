/* 名古屋兩家旅 — OpenAI 中繼 Worker
   環境變數（Settings → Variables and Secrets）：
     OPENAI_API_KEY   (Secret)  你的 OpenAI API key
     FAMILY_PASSWORD  (Secret)  家族密碼，app 會帶在 x-family-key header
     ALLOWED_ORIGIN   (選填)    允許呼叫的網址，逗號分隔，例如 https://a.github.io,http://127.0.0.1:8765；不填＝全部允許
*/
const ALLOWED_MODELS = ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini', 'gpt-4.1', 'gpt-5-mini', 'gpt-5'];
const MAX_TOKENS = 1200;          // 每次回答上限，控制費用
const MAX_BODY = 60_000;          // 請求大小上限（字元）

const allowedList = env => (env.ALLOWED_ORIGIN || '').split(',').map(x => x.trim().replace(/\/$/, '')).filter(Boolean);
const originOk = (env, origin) => { const L = allowedList(env); return !L.length || !origin || L.includes(origin); };
const cors = (env, origin) => ({
  'Access-Control-Allow-Origin': originOk(env, origin) && origin ? origin : (allowedList(env)[0] || '*'),
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-family-key',
  'Access-Control-Max-Age': '86400',
  'Vary': 'Origin',
});

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = cors(env, origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method === 'GET') return new Response(JSON.stringify({ ok: true, service: 'nagoya-trip ai proxy' }), { headers: { ...headers, 'Content-Type': 'application/json' } });
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers });

    if (!originOk(env, origin)) return json({ error: { message: `來源 ${origin} 不在允許名單，請用正式網址開 app` } }, 403, headers);
    const key = request.headers.get('x-family-key') || '';
    if (!env.FAMILY_PASSWORD || key !== env.FAMILY_PASSWORD) return json({ error: { message: '家族密碼錯誤' } }, 401, headers);
    if (!env.OPENAI_API_KEY) return json({ error: { message: 'Worker 尚未設定 OPENAI_API_KEY' } }, 500, headers);

    let body;
    try { const txt = await request.text(); if (txt.length > MAX_BODY) return json({ error: { message: '請求太大' } }, 413, headers); body = JSON.parse(txt); }
    catch { return json({ error: { message: 'bad json' } }, 400, headers); }

    const model = ALLOWED_MODELS.includes(body.model) ? body.model : 'gpt-4o-mini';
    const payload = { model, messages: body.messages || [], stream: !!body.stream, temperature: body.temperature ?? 0.6, max_tokens: Math.min(body.max_tokens || MAX_TOKENS, MAX_TOKENS) };

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` }, body: JSON.stringify(payload),
    });
    const out = new Headers(headers);
    out.set('Content-Type', upstream.headers.get('Content-Type') || 'application/json');
    if (payload.stream) out.set('Cache-Control', 'no-cache');
    return new Response(upstream.body, { status: upstream.status, headers: out });
  },
};
function json(obj, status, headers) { return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } }); }
