// api/stream.js
export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const q = url.searchParams;
    const model   = (q.get('model') || q.get('models') || 'gpt-4o-mini').trim();
    const message = (q.get('message') || '').toString();
    const chatId  = q.get('chat_id') || `chat_${Date.now()}`;
    const mode    = (q.get('mode') || 'stream').toLowerCase(); // "stream" | "once"
    const isJSON  = mode === 'once';

    let collected = '';
    const sseHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache, no-transform',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'X-Accel-Buffering': 'no'
    };
    const jsonHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8'
    };

    if (!isJSON) {
      Object.entries(sseHeaders).forEach(([k, v]) => res.setHeader(k, v));
      res.write(`event: start\n`);
      res.write(`data: ${JSON.stringify({ model, chat_id: chatId })}\n\n`);
    }

    const emit = (event, data) => {
      if (isJSON) { if (event === 'delta' && data?.text) collected += data.text; return; }
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data || {})}\n\n`);
    };

    const lower = model.toLowerCase();

    if (lower.startsWith('gpt-'))      { await withOpenAI({ model, message, emit }); return done(); }
    if (lower.startsWith('claude'))    { await withAnthropic({ model, message, emit }); return done(); }
    if (lower.startsWith('gemini'))    { await withGemini({ model, message, emit }); return done(); }
    if (lower.startsWith('grok'))      { await withXAI({ model, message, emit }); return done(); }
    if (lower.startsWith('deepseek'))  { await withDeepSeek({ model, message, emit }); return done(); }
    if (lower.startsWith('meta-llama') || lower.includes('llama')) {
      await withTogether({ model, message, emit }); return done();
    }

    throw new Error(`Modelis "${model}" nepalaikomas. Patikrink /api/models ir ENV raktus.`);

    function done(ok = true) {
      if (isJSON) {
        Object.entries(jsonHeaders).forEach(([k, v]) => res.setHeader(k, v));
        res.statusCode = 200;
        res.end(JSON.stringify({ ok, answers: [{ model, text: collected }] }));
      } else {
        emit('done', { finish_reason: 'stop' });
        res.end();
      }
    }
  } catch (err) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const isJSON = (url.searchParams.get('mode') || '').toLowerCase() === 'once';
    const payload = { message: String(err?.message || err) };
    if (isJSON) {
      res.statusCode = 200;
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ ok:false, error: payload }));
      return;
    }
    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform'
    });
    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    res.write(`event: done\n`);
    res.write(`data: {"finish_reason":"error"}\n\n`);
    res.end();
  }
}

/* ------- bendras OpenAI-style SSE skaitytuvas ------- */
async function pipeOpenAIStyleStream(resp, emit) {
  if (!resp.ok) {
    const t = await resp.text().catch(() => '');
    emit('error', { message: `HTTP ${resp.status} — ${t.slice(0, 200)}` });
    return;
  }
  const reader = resp.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const it = await reader.read();
    if (it.done) break;
    buf += dec.decode(it.value, { stream:true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 2);
      if (!frame) continue;
      const lines = frame.split('\n');
      for (const line of lines) {
        const p = line.trim();
        if (!p.startsWith('data:')) continue;
        const payload = p.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const j = JSON.parse(payload);
          const piece = j?.choices?.[0]?.delta?.content;
          if (piece) emit('delta', { text: piece });
        } catch {}
      }
    }
  }
}

/* ------- Tiekėjai ------- */
async function withOpenAI({ model, message, emit }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY nerastas');
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, stream: true,
      messages: [
        { role:'system', content:'You are a helpful assistant. If the user writes in Lithuanian, answer in Lithuanian.' },
        { role:'user', content: message }
      ]
    })
  });
  await pipeOpenAIStyleStream(r, emit);
}

async function withAnthropic({ model, message, emit }) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY nerastas');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model, stream:true, max_tokens:1024,
      system:'You are a helpful assistant. If the user writes in Lithuanian, answer in Lithuanian.',
      messages:[{ role:'user', content: message }]
    })
  });

  if (!r.ok) {
    const t = await r.text().catch(() => '');
    emit('error', { message: `Anthropic HTTP ${r.status} — ${t.slice(0, 200)}` });
    return;
  }

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const it = await reader.read();
    if (it.done) break;
    buf += dec.decode(it.value, { stream:true });
    let idx;
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, idx).trim(); buf = buf.slice(idx + 2);
      if (!frame) continue;
      const lines = frame.split('\n');
      const ev = lines.find(l => l.startsWith('event:'))?.slice(6).trim();
      const dl = lines.find(l => l.startsWith('data:'))?.slice(5).trim();
      if (!dl) continue;
      if (ev === 'content_block_delta') {
        try {
          const j = JSON.parse(dl);
          const piece = j?.delta?.text || '';
          if (piece) emit('delta', { text: piece });
        } catch {}
      }
    }
  }
}

async function withGemini({ model, message, emit }) {
  const key = process.env.GOOGLE_API_KEY || process.env.GOOGLE_GENAI_API_KEY;
  if (!key) throw new Error('GOOGLE_API_KEY (arba GOOGLE_GENAI_API_KEY) nerastas');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?key=${encodeURIComponent(key)}`;
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents:[{ role:'user', parts:[{ text: message }]}] })
  });

  if (!r.ok) {
    const t = await r.text().catch(() => '');
    emit('error', { message: `Gemini HTTP ${r.status} — ${t.slice(0, 200)}` });
    return;
  }

  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const it = await reader.read();
    if (it.done) break;
    buf += dec.decode(it.value, { stream:true });
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      let line = buf.slice(0, idx); buf = buf.slice(idx + 1);
      line = line.trim(); if (!line) continue;
      if (line.startsWith('data:')) line = line.slice(5).trim();
      try {
        const j = JSON.parse(line);
        for (const c of (j.candidates || [])) {
          const parts = c?.content?.parts || [];
          for (const p of parts) {
            const t = p?.text || p;
            if (typeof t === 'string' && t) emit('delta', { text: t });
          }
        }
      } catch {}
    }
  }
}

async function withXAI({ model, message, emit }) {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error('XAI_API_KEY nerastas');
  const r = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream:true, messages:[{ role:'user', content: message }] })
  });
  await pipeOpenAIStyleStream(r, emit);
}

async function withDeepSeek({ model, message, emit }) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY nerastas');
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream:true, messages:[{ role:'user', content: message }] })
  });
  await pipeOpenAIStyleStream(r, emit);
}

async function withTogether({ model, message, emit }) {
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error('TOGETHER_API_KEY nerastas');
  const r = await fetch('https://api.together.xyz/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream:true, messages:[{ role:'user', content: message }] })
  });
  await pipeOpenAIStyleStream(r, emit);
}
