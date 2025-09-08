// /api/diagnostics.js
// Greita "live" diagnostika visiems tiekėjams. NENAUDOJA SSE į UI – grąžina JSON.

const enc = txt => new TextEncoder().encode(txt);

async function firstChunk(reader) {
  const start = Date.now();
  let got = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      got += new TextDecoder().decode(value);
      if (got.length > 0) break;
    }
  } catch (e) {}
  return { ms: Date.now() - start, chunk: got.slice(0, 2000) };
}

async function checkOpenAI(message, model, key) {
  if (!key) return { ok: false, error: 'MISSING OPENAI_API_KEY' };
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: message }], stream: true }),
  });
  if (!r.ok) return { ok: false, status: r.status, body: await r.text() };
  const { ms, chunk } = await firstChunk(r.body.getReader());
  return { ok: true, first_token_ms: ms, sample: chunk };
}

async function checkAnthropic(message, model, key) {
  if (!key) return { ok: false, error: 'MISSING ANTHROPIC_API_KEY' };
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({ model, max_tokens: 256, messages: [{ role: 'user', content: message }], stream: true })
  });
  if (!r.ok) return { ok: false, status: r.status, body: await r.text() };
  const { ms, chunk } = await firstChunk(r.body.getReader());
  return { ok: true, first_token_ms: ms, sample: chunk };
}

async function checkXAI(message, model, key) {
  if (!key) return { ok: false, error: 'MISSING XAI_API_KEY' };
  const r = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: message }], stream: true })
  });
  if (!r.ok) return { ok: false, status: r.status, body: await r.text() };
  const { ms, chunk } = await firstChunk(r.body.getReader());
  return { ok: true, first_token_ms: ms, sample: chunk };
}

async function checkDeepseek(message, model, key) {
  if (!key) return { ok: false, error: 'MISSING DEEPSEEK_API_KEY' };
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: message }], stream: true })
  });
  if (!r.ok) return { ok: false, status: r.status, body: await r.text() };
  const { ms, chunk } = await firstChunk(r.body.getReader());
  return { ok: true, first_token_ms: ms, sample: chunk };
}

async function checkTogether(message, model, key) {
  if (!key) return { ok: false, error: 'MISSING TOGETHER_API_KEY' };
  const r = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: message }], stream: true })
  });
  if (!r.ok) return { ok: false, status: r.status, body: await r.text() };
  const { ms, chunk } = await firstChunk(r.body.getReader());
  return { ok: true, first_token_ms: ms, sample: chunk };
}

async function checkGemini(message, model, key) {
  // DĖMESIO: “Gemini 2.5 Flash” dažniausiai yra Vertex AI. Su API Key veikia 2.0 Flash (REST v1beta).
  if (!key) return { ok: false, error: 'MISSING GOOGLE_API_KEY' };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent('gemini-2.0-flash-exp')}:streamGenerateContent?key=${key}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: message }]}] })
  });
  if (!r.ok) return { ok: false, status: r.status, body: await r.text() };
  const { ms, chunk } = await firstChunk(r.body.getReader());
  return { ok: true, first_token_ms: ms, sample: chunk };
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const message = req.query.message || 'Sveikas, patikra. Parašyk “ok”.';
  const results = {};

  try {
    results.openai   = await checkOpenAI(message, 'gpt-4o-mini', process.env.OPENAI_API_KEY);
  } catch(e){ results.openai = { ok:false, error: String(e) }; }

  try {
    results.anthropic = await checkAnthropic(message, 'claude-4-sonnet', process.env.ANTHROPIC_API_KEY);
  } catch(e){ results.anthropic = { ok:false, error: String(e) }; }

  try {
    results.xai     = await checkXAI(message, 'grok-4', process.env.XAI_API_KEY);
  } catch(e){ results.xai = { ok:false, error: String(e) }; }

  try {
    results.deepseek = await checkDeepseek(message, 'deepseek-chat', process.env.DEEPSEEK_API_KEY);
  } catch(e){ results.deepseek = { ok:false, error: String(e) }; }

  try {
    results.together = await checkTogether(message, 'meta-llama/Llama-4-Scout-17B-16E-Instruct', process.env.TOGETHER_API_KEY);
  } catch(e){ results.together = { ok:false, error: String(e) }; }

  try {
    results.google  = await checkGemini(message, 'gemini-2.5-flash', process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY);
  } catch(e){ results.google = { ok:false, error: String(e) }; }

  res.status(200).json({ ok: true, results });
};
