// /api/stream.js
// Vienas SSE endpointas visiems modeliams. Skirtingiems tiekėjams taiko teisingą streamingą.

function sendHeaders(res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
}

function sse(res, obj, event) {
  if (event) res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function heartbeat(res) {
  return setInterval(() => res.write(`:hb ${Date.now()}\n\n`), 15000);
}

function pickModel(req) {
  const q = req.query || {};
  const m = q.model || q.models || (req.body && req.body.model) || 'gpt-4o-mini';
  return Array.isArray(m) ? m[0] : String(m);
}

function pickMessage(req) {
  if (req.method === 'POST') {
    try {
      if (req.body && typeof req.body.message === 'string') return req.body.message;
    } catch (_){}
  }
  return req.query.message || 'Labas!';
}

function providerFor(model) {
  const id = (model || '').toLowerCase();
  if (id.startsWith('gpt-')) return 'openai';
  if (id.startsWith('claude')) return 'anthropic';
  if (id.startsWith('grok')) return 'xai';
  if (id.includes('gemini')) return 'google';
  if (id.includes('deepseek')) return 'deepseek';
  if (id.startsWith('meta-llama/')) return 'together';
  return 'openai';
}

async function pipeOpenAIStyle(url, headers, body, res, tag) {
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) {
    const text = await r.text();
    sse(res, { provider: tag, status: r.status, body: text }, 'error');
    return;
  }
  const reader = r.body.getReader();
  const td = new TextDecoder();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    res.write(td.decode(value));
  }
}

async function pipeAnthropic(model, message, res) {
  const url = 'https://api.anthropic.com/v1/messages';
  const headers = {
    'x-api-key': process.env.ANTHROPIC_API_KEY || '',
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  };
  if (!headers['x-api-key']) {
    sse(res, { provider: 'anthropic', error: 'MISSING ANTHROPIC_API_KEY' }, 'error');
    return;
  }
  const body = { model, max_tokens: 1024, stream: true, messages: [{ role: 'user', content: message }] };
  const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!r.ok) {
    const text = await r.text();
    sse(res, { provider: 'anthropic', status: r.status, body: text }, 'error');
    return;
  }
  // Anthropic grąžina SSE su event tipais. Konvertuojam į OpenAI-stiliaus delta.
  const reader = r.body.getReader();
  const td = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += td.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const lines = raw.split('\n');
      let ev = null, data = null;
      for (const ln of lines) {
        if (ln.startsWith('event:')) ev = ln.slice(6).trim();
        if (ln.startsWith('data:'))  data = ln.slice(5).trim();
      }
      if (!data) continue;
      try {
        const obj = JSON.parse(data);
        if (ev === 'content_block_delta' && obj.delta && obj.delta.type === 'text_delta') {
          // OpenAI-style delta
          res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: obj.delta.text, role: 'assistant' } }] })}\n\n`);
        } else if (ev === 'message_stop') {
          res.write('data: [DONE]\n\n');
        }
      } catch (_){}
    }
  }
}

async function pipeGoogleGemini(model, message, res) {
  // Su API Key saugiausia naudoti 2.0 flash exp stream endpoint’ą.
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  if (!key) {
    sse(res, { provider: 'google', error: 'MISSING GOOGLE_API_KEY' }, 'error');
    return;
  }
  const modelId = model.includes('2.5') ? 'gemini-2.0-flash-exp' : 'gemini-2.0-flash-exp';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?key=${key}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: message }]}] })
  });
  if (!r.ok) {
    const text = await r.text();
    sse(res, { provider: 'google', status: r.status, body: text }, 'error');
    return;
  }
  const reader = r.body.getReader();
  const td = new TextDecoder();
  // Google siunčia daug JSON eilučių (ne klasikinį SSE). Konvertuojam į OpenAI-stilių.
  let buf = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += td.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        const text = obj?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
        if (text) res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: text, role: 'assistant' } }] })}\n\n`);
      } catch (_){}
    }
  }
  res.write('data: [DONE]\n\n');
}

module.exports = async (req, res) => {
  try {
    sendHeaders(res);
    const hb = heartbeat(res);

    // Body iš POST, jei yra
    if (req.method === 'POST' && !req.body) {
      // Vercel body parser
      let raw = '';
      for await (const chunk of req) raw += chunk;
      try { req.body = JSON.parse(raw || '{}'); } catch (_){ req.body = {}; }
    }

    const model = pickModel(req);
    const message = pickMessage(req);
    const provider = providerFor(model);

    sse(res, { phase: 'start', model, provider }, 'info');

    if (provider === 'openai') {
      await pipeOpenAIStyle(
        'https://api.openai.com/v1/chat/completions',
        { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`, 'Content-Type': 'application/json' },
        { model, messages: [{ role: 'user', content: message }], stream: true },
        res, 'openai'
      );
    } else if (provider === 'deepseek') {
      await pipeOpenAIStyle(
        'https://api.deepseek.com/chat/completions',
        { 'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY || ''}`, 'Content-Type': 'application/json' },
        { model, messages: [{ role: 'user', content: message }], stream: true },
        res, 'deepseek'
      );
    } else if (provider === 'together') {
      await pipeOpenAIStyle(
        'https://api.together.xyz/v1/chat/completions',
        { 'Authorization': `Bearer ${process.env.TOGETHER_API_KEY || ''}`, 'Content-Type': 'application/json' },
        { model, messages: [{ role: 'user', content: message }], stream: true },
        res, 'together'
      );
    } else if (provider === 'xai') {
      await pipeOpenAIStyle(
        'https://api.x.ai/v1/chat/completions',
        { 'Authorization': `Bearer ${process.env.XAI_API_KEY || ''}`, 'Content-Type': 'application/json' },
        { model, messages: [{ role: 'user', content: message }], stream: true },
        res, 'xai'
      );
    } else if (provider === 'anthropic') {
      await pipeAnthropic(model, message, res);
    } else if (provider === 'google') {
      await pipeGoogleGemini(model, message, res);
    } else {
      sse(res, { error: `Unknown provider for model ${model}` }, 'error');
    }

    clearInterval(hb);
    res.end();
  } catch (e) {
    sse(res, { error: String(e && e.message ? e.message : e) }, 'error');
    try { res.end(); } catch (_){}
  }
};
