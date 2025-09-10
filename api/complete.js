// /api/complete.js
// Vercel serverless (Node 18+). Vienas endpointas JSON modeliams: Claude, Grok, Gemini.
// Grąžina: { ok, chat_id, answers:[{model, text, error}], errors:[{front, error}] }

const TIMEOUT_MS = 25000;

function badRequest(res, msg) {
  res.status(400).json({ ok: false, error: msg || 'Bad request' });
}

function withTimeout(ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort('timeout'), ms);
  return { signal: ac.signal, done: () => clearTimeout(t) };
}

function pickArrayText(blocks) {
  // Anthropic content: [{type:'text', text:'...'}, ...]
  if (!Array.isArray(blocks)) return '';
  return blocks.map(b => (typeof b?.text === 'string' ? b.text : '')).join('');
}

/** ===== Providers ===== **/

async function callAnthropic(model, prompt, maxTokens) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('Anthropic API key missing');

  const url = 'https://api.anthropic.com/v1/messages';
  const body = {
    model,
    max_tokens: Math.max(1, Math.min(Number(maxTokens) || 1024, 4096)),
    messages: [{ role: 'user', content: prompt }]
  };

  const to = withTimeout(TIMEOUT_MS);
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body),
    signal: to.signal
  }).catch(e => { throw new Error('Anthropic fetch error: ' + e.message); });
  to.done();

  if (!resp.ok) {
    // Dėmesio: dažna klaida – neteisingas modelio ID arba versijos headeris
    let msg = `Anthropic HTTP ${resp.status}`;
    try { const j = await resp.json(); msg = j?.error?.message || msg; } catch(_) {}
    throw new Error(msg);
  }
  const data = await resp.json();
  const text = pickArrayText(data?.content) || '';
  return text;
}

async function callXAI(model, prompt) {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error('xAI API key missing');

  const url = 'https://api.x.ai/v1/chat/completions';
  const body = {
    model,                       // pvz. "grok-4"
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    temperature: 0.7
  };

  const to = withTimeout(TIMEOUT_MS);
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${key}`
    },
    body: JSON.stringify(body),
    signal: to.signal
  }).catch(e => { throw new Error('Grok fetch error: ' + e.message); });
  to.done();

  if (resp.status === 403) throw new Error('Grok HTTP 403');
  if (!resp.ok) {
    let msg = `Grok HTTP ${resp.status}`;
    try { const j = await resp.json(); msg = j?.error?.message || msg; } catch(_) {}
    throw new Error(msg);
  }
  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content || '';
  return text;
}

async function callGemini(model, prompt) {
  // Google Generative Language API (v1beta)
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY;
  if (!key) throw new Error('Gemini API key missing');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }]}]
  };

  const to = withTimeout(TIMEOUT_MS);
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: to.signal
  }).catch(e => { throw new Error('Gemini fetch error: ' + e.message); });
  to.done();

  if (!resp.ok) {
    let msg = `Gemini HTTP ${resp.status}`;
    try { const j = await resp.json(); msg = j?.error?.message || msg; } catch(_) {}
    throw new Error(msg);
  }
  const data = await resp.json();

  // Naujesni modeliai (2.5) dažnai grąžina čia:
  // candidates[0].content.parts[].text
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map(p => p?.text || '').join('') : '';
  return text || '';
}

/** ===== Router pagal modelio ID ===== **/
async function runOneModel(backId, prompt, maxTokens) {
  const id = (backId || '').toLowerCase();

  if (id.startsWith('claude')) {
    return await callAnthropic(backId, prompt, maxTokens);
  }
  if (id.startsWith('grok')) {
    return await callXAI(backId, prompt);
  }
  if (id.startsWith('gemini')) {
    return await callGemini(backId, prompt);
  }

  // Atsarginis fallback – jei kas per klaidą ateis čia JSON keliu
  throw new Error('Unsupported model for /complete: ' + backId);
}

/** ===== Vercel handler ===== **/
module.exports = async (req, res) => {
  // CORS – kad JSON kelias būtų ramus
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  if (req.method !== 'POST') return badRequest(res, 'Use POST');

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); }
  catch { return badRequest(res, 'Invalid JSON'); }

  const message   = (body.message || '').toString();
  const chat_id   = body.chat_id || null;
  const maxTokens = body.max_tokens || 1024;
  const modelsStr = (body.models || '').toString();
  const models    = modelsStr.split(',').map(s => s.trim()).filter(Boolean);

  if (!message) return badRequest(res, 'Missing "message"');
  if (!models.length) return badRequest(res, 'Missing "models"');

  // Paleidžiam visus lygiagrečiai, bet nekrentam, jei kuriam nepasiseks
  const results = await Promise.allSettled(models.map(m => runOneModel(m, message, maxTokens)));

  const answers = results.map((r, i) => {
    const model = models[i];
    if (r.status === 'fulfilled') {
      const txt = (r.value || '').toString();
      return { model, text: txt, error: '' };
    } else {
      const errMsg = (r.reason && r.reason.message) ? String(r.reason.message) : 'Error';
      return { model, text: '', error: errMsg };
    }
  });

  // trumpa errors santrauka frontui (kaip tavo UI tikisi)
  const errors = answers.filter(a => a.error).map(a => ({ front: modelFrontFromBack(a.model), error: a.error }));

  return res.status(200).json({ ok: true, chat_id, answers, errors });
};

// Pagalba gražiam "front" pavadinimui atgal
function modelFrontFromBack(back) {
  const id = (back || '').toLowerCase();
  if (id.startsWith('claude')) return 'claude';
  if (id.startsWith('gemini')) return 'gemini';
  if (id.startsWith('grok'))   return 'grok';
  return back;
}
