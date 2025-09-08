// /api/stream.js
// Vieningas SSE gateway visiems tiekėjams.
// Iš kliento ateina: message, model (arba models), chat_id, max_tokens, image_url (nebūtina), echo (debug).
// Grąžinam SSE su "data: { choices:[{ delta:{ role:'assistant', content:'...' } }] }"

const crypto = require('crypto');

function sseHeaders(res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // nginx proxies
  res.setHeader('Access-Control-Allow-Origin', '*');
  // Safari kartais buferiuoja – duodam padding.
  try { res.write(':' + ' '.repeat(2048) + '\n'); } catch (_) {}
  res.flushHeaders?.();
}

function writeDelta(res, text) {
  if (!text) return;
  const payload = { choices: [ { delta: { role: 'assistant', content: String(text) } } ] };
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function endSSE(res) {
  try {
    res.write('data: [DONE]\n\n');
    res.end();
  } catch (_){}
}

function getBody(req) {
  // palaikom GET su query ir POST su JSON
  return new Promise((resolve) => {
    if (req.method !== 'POST') return resolve(null);
    let data = '';
    req.on('data', (c) => data += c);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve(null); }
    });
  });
}

// Bendra OpenAI-like helper (OpenAI, DeepSeek, Together, xAI/Grok)
async function streamOpenAILike({ url, apiKey, model, userText, imageUrl, extraHeaders = {}, extraBody = {} }, res) {
  // Jei reikia paveikslėlio – įdedam kaip image_url (tinka Grok, OpenAI; Together dažnai ignoruoja)
  const userContent = imageUrl
    ? [
        { type: 'text', text: userText || '' },
        { type: 'image_url', image_url: { url: imageUrl, detail: 'high' } }
      ]
    : [ { type: 'text', text: userText || '' } ];

  const body = {
    model,
    stream: true,
    messages: [
      { role: 'user', content: userContent }
    ],
    ...extraBody
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...extraHeaders
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok || !resp.body) {
    writeDelta(res, `⚠️ ${model}: ${resp.status} ${resp.statusText}`);
    return endSSE(res);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of resp.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      if (!part.startsWith('data:')) continue;
      const jsonStr = part.replace(/^data:\s*/, '');
      if (jsonStr === '[DONE]') return endSSE(res);
      try {
        const obj = JSON.parse(jsonStr);
        const delta = obj?.choices?.[0]?.delta?.content || obj?.choices?.[0]?.delta || '';
        if (delta) writeDelta(res, delta);
      } catch { /* ignore */ }
    }
  }
  endSSE(res);
}

// Anthropic (Claude) – kitas SSE formatas
async function streamAnthropic({ apiKey, model, userText }, res) {
  const url = 'https://api.anthropic.com/v1/messages';
  const body = {
    model,
    max_tokens: 1024,
    stream: true,
    messages: [
      { role: 'user', content: userText || '' }
    ]
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok || !resp.body) {
    writeDelta(res, `⚠️ ${model}: ${resp.status} ${resp.statusText}`);
    return endSSE(res);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of resp.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const evt of events) {
      // formatas: "event: content_block_delta\ndata: {...}"
      const lines = evt.split('\n');
      let name = '';
      let data = '';
      for (const ln of lines) {
        if (ln.startsWith('event:')) name = ln.slice(6).trim();
        else if (ln.startsWith('data:')) data = ln.slice(5).trim();
      }
      if (!data) continue;
      if (data === '[DONE]') return endSSE(res);
      try {
        const obj = JSON.parse(data);
        if (name === 'content_block_delta' && obj?.delta?.type === 'text_delta') {
          writeDelta(res, obj.delta.text || '');
        }
      } catch { /* ignore */ }
    }
  }
  endSSE(res);
}

// Google Gemini – REST su alt=sse
async function streamGemini({ apiKey, model, userText }, res) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      { role: 'user', parts: [ { text: userText || '' } ] }
    ],
    generationConfig: { temperature: 0.7 }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok || !resp.body) {
    writeDelta(res, `⚠️ ${model}: ${resp.status} ${resp.statusText}`);
    return endSSE(res);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of resp.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts) {
      if (!part.startsWith('data:')) continue;
      const jsonStr = part.replace(/^data:\s*/, '');
      if (jsonStr === '[DONE]') return endSSE(res);
      try {
        const obj = JSON.parse(jsonStr);
        const text = obj?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
        if (text) writeDelta(res, text);
      } catch { /* ignore */ }
    }
  }
  endSSE(res);
}

module.exports = async (req, res) => {
  sseHeaders(res);

  // Įėjimo parametrai
  const body = await getBody(req);
  const q = req.query || {};
  const message = (body?.message ?? q.message ?? '').toString();
  const model   = (body?.model   ?? q.model   ?? 'gpt-4o-mini').toString();
  const imageUrl = (body?.image_url ?? q.image_url ?? '').toString();

  // Greitas echo testas (palikta diagnostikai): /api/stream?message=Labas&echo=1
  if (q.echo === '1' || body?.echo === 1) {
    const chunks = [`Pradžia: ${message || 'Labas'}`, '…dirbam…', '…be tiekėjų…', 'Baigiam.'];
    let i = 0;
    const t = setInterval(() => {
      if (i < chunks.length) writeDelta(res, chunks[i++]);
      else { clearInterval(t); endSSE(res); }
    }, 500);
    req.on('close', () => { clearInterval(t); try{res.end();}catch(_){ } });
    return;
  }

  try {
    // Pasirenkam teikėją pagal modelį
    if (model === 'gpt-4o-mini') {
      await streamOpenAILike({
        url: 'https://api.openai.com/v1/chat/completions',
        apiKey: process.env.OPENAI_API_KEY,
        model,
        userText: message,
        imageUrl
      }, res);
      return;
    }

    if (model === 'deepseek-chat') {
      await streamOpenAILike({
        url: 'https://api.deepseek.com/v1/chat/completions',
        apiKey: process.env.DEEPSEEK_API_KEY,
        model: 'deepseek-chat',
        userText: message
      }, res);
      return;
    }

    if (model === 'grok-4') {
      await streamOpenAILike({
        url: 'https://api.x.ai/v1/chat/completions',
        apiKey: process.env.XAI_API_KEY,
        model: 'grok-4',
        userText: message,
        imageUrl // -> Grok supras "image_url"
      }, res);
      return;
    }

    if (model === 'meta-llama/Llama-4-Scout-17B-16E-Instruct') {
      await streamOpenAILike({
        url: 'https://api.together.xyz/v1/chat/completions',
        apiKey: process.env.TOGETHER_API_KEY,
        model,
        userText: message
      }, res);
      return;
    }

    if (model === 'claude-4-sonnet') {
      await streamAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: 'claude-4-sonnet',
        userText: message
      }, res);
      return;
    }

    if (model === 'gemini-2.5-flash') {
      await streamGemini({
        apiKey: process.env.GOOGLE_API_KEY,
        model: 'gemini-2.5-flash',
        userText: message
      }, res);
      return;
    }

    // Neatpažintas modelis
    writeDelta(res, `⚠️ Neatpažintas modelis: ${model}`);
    endSSE(res);
  } catch (e) {
    writeDelta(res, `⚠️ Klaida: ${e?.message || e}`);
    endSSE(res);
  }
};
