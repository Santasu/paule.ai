// api/stream.js
/* eslint-disable no-console */

// Vercel Node runtime (lambda) – paprastas SSE tiltas visiems tiekėjams.
// OpenAI/DeepSeek/Together/xAI – OpenAI-compatible Chat Completions (SSE).
// Anthropic (Claude) – Messages SSE su event'ais (content_block_delta).
// Gemini – "once" į REST, o atsakymą paverčiame į SSE, kad UI išliktų vientisas.

const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const DEEPSEEK_ENDPOINT = 'https://api.deepseek.com/v1/chat/completions';
const TOGETHER_ENDPOINT = 'https://api.together.xyz/v1/chat/completions';
const XAI_ENDPOINT = 'https://api.x.ai/v1/chat/completions';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
// Gemini: čia naudosime "generateContent" (vienkartinį), paskui "streaminsim" patys
const GEMINI_GENERATE =
  (model, key) =>
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;

function sseHeaders(res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Vercel/NGINX: neleisti buferiuoti
  res.setHeader('X-Accel-Buffering', 'no');
}

function sseSend(res, data, eventName) {
  if (eventName) res.write(`event: ${eventName}\n`);
  res.write(`data: ${data}\n\n`);
}

function sseText(res, chunk) {
  if (chunk && chunk.length) {
    sseSend(res, JSON.stringify({ type: 'token', text: chunk }));
  }
}

function sseDone(res) {
  sseSend(res, '[DONE]');
  try { res.end(); } catch (_) {}
}

function modelKind(model) {
  const m = (model || '').toLowerCase();
  if (m.startsWith('claude') || m.includes('anthropic')) return 'anthropic';
  if (m.startsWith('grok') || m.includes('xai')) return 'xai';
  if (m.startsWith('gemini')) return 'gemini';
  if (m.includes('llama') || m.includes('meta-llama') || m.includes('together')) return 'together';
  if (m.includes('deepseek')) return 'deepseek';
  if (m.startsWith('gpt') || m.includes('openai')) return 'openai';
  // default – bandysim OpenAI compat
  return 'openai';
}

async function pipeOpenAICompat({ endpoint, apiKey, body, res }) {
  const r = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!r.ok || !r.body) {
    const text = await r.text().catch(() => '');
    sseSend(res, JSON.stringify({ error: true, status: r.status, body: text }));
    return sseDone(res);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 2);

      if (!frame) continue;
      // OpenAI-compat SSE: linijos prasideda "data:"
      const lines = frame.split('\n').map(l => l.replace(/^data:\s?/, ''));
      for (const data of lines) {
        if (data === '[DONE]') {
          return sseDone(res);
        }
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta?.content
                     ?? json.choices?.[0]?.message?.content // kai kurie tiekėjai taip siunčia
                     ?? '';
          if (delta) sseText(res, delta);
        } catch {
          // Kartais tiekėjas įterpia keepalive/ping/komentarus
        }
      }
    }
  }
  sseDone(res);
}

async function pipeAnthropic({ model, prompt, maxTokens, apiKey, res }) {
  const r = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'content-type': 'application/json',
      'anthropic-version': '2023-06-01', // pagal oficialų Messages API
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens || 1024,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    }),
  });

  if (!r.ok || !r.body) {
    const text = await r.text().catch(() => '');
    sseSend(res, JSON.stringify({ error: true, status: r.status, body: text }));
    return sseDone(res);
  }

  const reader = r.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buf = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    // Anthropic SSE rėmas taip pat baigiasi tuščia eilute
    let idx;
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const frame = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 2);

      if (!frame) continue;

      // rėme būna:
      // event: content_block_delta
      // data: {... "delta": {"type":"text_delta","text":"..."} }
      const lines = frame.split('\n');
      let ev = null;
      let dataStr = null;
      for (const ln of lines) {
        if (ln.startsWith('event:')) ev = ln.slice(6).trim();
        if (ln.startsWith('data:')) dataStr = ln.slice(5).trim();
      }
      if (!dataStr) continue;

      if (dataStr === '[DONE]') return sseDone(res);

      try {
        const data = JSON.parse(dataStr);
        if (ev === 'content_block_delta') {
          const txt = data?.delta?.text || '';
          if (txt) sseText(res, txt);
        } else if (ev === 'message_delta' && data?.delta?.stop_reason) {
          // pabaiga
        } else if (ev === 'message_stop') {
          return sseDone(res);
        }
      } catch {
        // ignore
      }
    }
  }

  sseDone(res);
}

async function pipeGeminiOnce({ model, prompt, maxTokens, apiKey, res }) {
  // "Vieno šūvio" užklausa, tada patys pasi-stream'inam į naršyklę.
  const r = await fetch(GEMINI_GENERATE(model, apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }]}],
      generationConfig: { maxOutputTokens: maxTokens || 1024 },
    }),
  });

  if (!r.ok) {
    const text = await r.text().catch(() => '');
    sseSend(res, JSON.stringify({ error: true, status: r.status, body: text }));
    return sseDone(res);
  }

  const json = await r.json();
  const text =
    json?.candidates?.[0]?.content?.parts?.map(p => p.text).join('') ||
    json?.candidates?.[0]?.output || // kai kuriose versijose
    '';

  // Imituojame "tekėjimą" gabalais, kad UI būtų vienodas
  const CHUNK = 64;
  for (let i = 0; i < text.length; i += CHUNK) {
    sseText(res, text.slice(i, i + CHUNK));
    // trumpas flush
    await new Promise(r => setTimeout(r, 5));
  }
  sseDone(res);
}

module.exports = async (req, res) => {
  try {
    const {
      message = '',
      model = 'gpt-4o-mini',
      max_tokens: maxTokens = 1024,
      // kai klientas perduoda "models=...", pasiliekam pirmą kaip aktyvų
      models: multi = ''
    } = Object.assign({}, req.query || {}, req.body || {});

    const actualModel = (model || (multi ? String(multi).split(',')[0] : 'gpt-4o-mini')).trim();

    sseHeaders(res);

    // apsauginis ping'as kas ~15s, kad tarp CDN ir naršyklės neuždarytų
    const ping = setInterval(() => sseSend(res, 'ping', 'ping'), 15000);
    const endPing = () => { try { clearInterval(ping); } catch(_) {} };

    const kind = modelKind(actualModel);

    if (kind === 'anthropic') {
      await pipeAnthropic({
        model: actualModel,
        prompt: String(message || ''),
        maxTokens: Number(maxTokens) || 1024,
        apiKey: process.env.ANTHROPIC_API_KEY,
        res,
      });
      endPing(); return;
    }

    if (kind === 'xai') {
      await pipeOpenAICompat({
        endpoint: XAI_ENDPOINT,
        apiKey: process.env.XAI_API_KEY,
        res,
        body: {
          model: actualModel, // pvz. "grok-2-latest"
          stream: true,
          messages: [{ role: 'user', content: String(message || '') }],
          max_tokens: Number(maxTokens) || 1024,
        },
      });
      endPing(); return;
    }

    if (kind === 'gemini') {
      await pipeGeminiOnce({
        model: actualModel || 'gemini-1.5-flash',
        prompt: String(message || ''),
        maxTokens: Number(maxTokens) || 1024,
        apiKey: process.env.GOOGLE_API_KEY,
        res,
      });
      endPing(); return;
    }

    if (kind === 'deepseek') {
      await pipeOpenAICompat({
        endpoint: DEEPSEEK_ENDPOINT,
        apiKey: process.env.DEEPSEEK_API_KEY,
        res,
        body: {
          model: actualModel,
          stream: true,
          messages: [{ role: 'user', content: String(message || '') }],
          max_tokens: Number(maxTokens) || 1024,
        },
      });
      endPing(); return;
    }

    if (kind === 'together') {
      await pipeOpenAICompat({
        endpoint: TOGETHER_ENDPOINT,
        apiKey: process.env.TOGETHER_API_KEY,
        res,
        body: {
          model: actualModel,
          stream: true,
          messages: [{ role: 'user', content: String(message || '') }],
          max_tokens: Number(maxTokens) || 1024,
        },
      });
      endPing(); return;
    }

    // default: OpenAI
    await pipeOpenAICompat({
      endpoint: OPENAI_ENDPOINT,
      apiKey: process.env.OPENAI_API_KEY,
      res,
      body: {
        model: actualModel,
        stream: true,
        messages: [{ role: 'user', content: String(message || '') }],
        max_tokens: Number(maxTokens) || 1024,
      },
    });
    endPing();
  } catch (e) {
    try {
      sseSend(res, JSON.stringify({ error: true, message: e?.message || String(e) }));
      sseDone(res);
    } catch (_) {}
  }
};
