// /api/stream.js
export const config = { runtime: 'edge' };

const H = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  'x-accel-buffering': 'no',
  'Access-Control-Allow-Origin': '*'
};

const MAP = Object.freeze({
  // SSE modeliai (liks kaip yra; čia tik nurodom tiekėją)
  'gpt-4o-mini': { provider: 'openai' },
  'deepseek-chat': { provider: 'deepseek' },
  'meta-llama/Llama-4-Scout-17B-16E-Instruct': { provider: 'together' }
});

export default async function handler(req) {
  const url = new URL(req.url);
  const model = url.searchParams.get('model') || url.searchParams.get('models') || '';
  const message = url.searchParams.get('message') || '';
  const max_tokens = Math.min(4096, Number(url.searchParams.get('max_tokens') || '1024'));

  const m = MAP[model];
  if (!m) {
    const err = sseError(`SSE nepalaikomas modeliui: ${model}. Naudok /api/complete.`);
    return new Response(err, { status: 200, headers: H });
  }

  try {
    const { endpoint, headers, body } = buildUpstream(m.provider, model, message, max_tokens);
    const up = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!up.ok || !up.body) {
      const reason = await tryJson(up).catch(()=>'');
      const errText = `Upstream ${m.provider} HTTP ${up.status}${reason ? ` – ${reason}` : ''}`;
      return new Response(sseError(errText), { status: 200, headers: H });
    }
    // tiesioginis body forward’as (paliekam tiekėjo SSE formatą)
    return new Response(up.body, { status: 200, headers: H });
  } catch (e) {
    return new Response(sseError((e && e.message) || 'Server stream error'), { status: 200, headers: H });
  }
}

function sseError(msg) {
  // standartizuotas „error“ event’as
  return `event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`;
}

function buildUpstream(provider, model, message, max_tokens) {
  if (provider === 'openai') {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new Error('Trūksta OPENAI_API_KEY');
    return {
      endpoint: 'https://api.openai.com/v1/chat/completions',
      headers: { 'content-type':'application/json', 'authorization':`Bearer ${key}` },
      body: { model, stream:true, max_tokens, messages:[{ role:'user', content: message }] }
    };
  }
  if (provider === 'deepseek') {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error('Trūksta D E E P S E E K _ A P I _ K E Y');
    return {
      endpoint: 'https://api.deepseek.com/chat/completions',
      headers: { 'content-type':'application/json', 'authorization':`Bearer ${key}` },
      body: { model, stream:true, max_tokens, messages:[{ role:'user', content: message }] }
    };
  }
  if (provider === 'together') {
    const key = process.env.TOGETHER_API_KEY;
    if (!key) throw new Error('Trūksta TOGETHER_API_KEY');
    return {
      endpoint: 'https://api.together.xyz/v1/chat/completions',
      headers: { 'content-type':'application/json', 'authorization':`Bearer ${key}` },
      body: { model, stream:true, max_tokens, messages:[{ role:'user', content: message }] }
    };
  }
  throw new Error('Nežinomas provideris');
}

async function tryJson(res) {
  try {
    const j = await res.json();
    return j?.error?.message || j?.message || JSON.stringify(j);
  } catch { return ''; }
}
