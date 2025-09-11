// /api/_utils.js
export const okJSON = (data, init={}) =>
  new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...init.headers },
    ...init
  });

export const badJSON = (status, message, extra={}) =>
  new Response(JSON.stringify({ ok:false, message, ...extra }), {
    status, headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }
  });

export const textSSE = (text) => `data: ${text}\n\n`; // raw string
export const jsonSSE = (obj)  => `data: ${JSON.stringify(obj)}\n\n`;
export const eventSSE = (event, data) => `event: ${event}\n${jsonSSE(data)}`;

export const openaiDelta = (piece) => jsonSSE({ choices:[{ delta:{ content:String(piece) } }] });

export function pickInt(v, def) {
  const n = parseInt(v,10); return Number.isFinite(n) && n>0 ? n : def;
}

export function isAnthropic(model=''){ return /^claude/i.test(model) || model.includes('sonnet'); }
export function isXAI(model=''){ return /grok/i.test(model); }
