// api/stream.js
const { sendSSEHeaders, sendEvent, endSSE, guessProvider, pickAutoModel, okJSON, badJSON, readQuery } = require('../_utils');
const { getEnv } = require('../_auth');
const https = require('https');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET'); return res.status(405).end('Method Not Allowed');
  }

  const env = getEnv();
  const q = readQuery(req);
  let { model, models, message, max_tokens, chat_id } = q;
  const chatId = String(chat_id || `chat_${Date.now()}`);

  // "auto" – nuspręsti kurį realiai kviesti
  if (!model || model === 'auto') model = pickAutoModel(env);

  // Tik šie trys yra SSE: OpenAI(ChatGPT), DeepSeek, Together(Llama)
  const provider = guessProvider(model);
  const sseCapable = (provider === 'openai' || provider === 'deepseek' || provider === 'together');

  if (!sseCapable) {
    // UI turėtų JSON fallback'ą, bet jeigu vis tiek pataikė – atsakom mandagiai:
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    sendEvent(res, 'start', JSON.stringify({ chat_id: chatId }));
    sendEvent(res, 'error', JSON.stringify({ message: 'Šis modelis transliuoja tik per JSON /api/complete' }));
    return endSSE(res);
  }

  sendSSEHeaders(res);
  sendEvent(res, 'start', JSON.stringify({ chat_id: chatId }));

  try {
    const controller = new AbortController();
    req.on('close', () => controller.abort());

    let url = '';
    let headers = {};
    let body = {};

    const sysPrompt = env.SYSTEM_PROMPT ? [{ role: 'system', content: env.SYSTEM_PROMPT }] : [];

    if (provider === 'openai') {
      if (!env.OPENAI) throw new Error('OPENAI_API_KEY nerastas');
      url = 'https://api.openai.com/v1/chat/completions';
      headers = {
        'Authorization': `Bearer ${env.OPENAI}`,
        'Content-Type': 'application/json'
      };
      body = {
        model,
        stream: true,
        max_tokens: Number(max_tokens) || 1024,
        temperature: 0.7,
        messages: [...sysPrompt, { role: 'user', content: String(message || '') }]
      };
    } else if (provider === 'deepseek') {
      if (!env.DEEPSEEK) throw new Error('DEEPSEEK_API_KEY nerastas');
      url = 'https://api.deepseek.com/chat/completions';
      headers = {
        'Authorization': `Bearer ${env.DEEPSEEK}`,
        'Content-Type': 'application/json'
      };
      body = {
        model,
        stream: true,
        max_tokens: Number(max_tokens) || 1024,
        temperature: 0.7,
        messages: [...sysPrompt, { role: 'user', content: String(message || '') }]
      };
    } else if (provider === 'together') {
      if (!env.TOGETHER) throw new Error('TOGETHER_API_KEY nerastas');
      url = 'https://api.together.xyz/v1/chat/completions';
      headers = {
        'Authorization': `Bearer ${env.TOGETHER}`,
        'Content-Type': 'application/json'
      };
      body = {
        model,
        stream: true,
        max_tokens: Number(max_tokens) || 1024,
        temperature: 0.7,
        messages: [...sysPrompt, { role: 'user', content: String(message || '') }]
      };
    } else {
      throw new Error('Nepalaikomas SSE tiekėjas');
    }

    const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });

    if (!resp.ok) {
      const txt = await safeText(resp);
      sendEvent(res, 'error', JSON.stringify({ message: `${provider} HTTP ${resp.status} — ${txt.slice(0, 400)}` }));
      return endSSE(res);
    }

    // Persiunčiam tiekėjo SSE → mūsų SSE
    const reader = resp.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let idx;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim();
        buffer = buffer.slice(idx + 1);

        if (!line) continue;
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();

        if (data === '[DONE]') {
          sendEvent(res, 'done', JSON.stringify({ finish_reason: 'stop' }));
          return endSSE(res);
        }

        // OpenAI-like: { choices: [{ delta: { content: "..." } }] }
        try {
          const obj = JSON.parse(data);
          const piece =
            obj?.choices?.[0]?.delta?.content ??
            obj?.choices?.[0]?.message?.content ??
            obj?.delta?.content ??
            obj?.text ??
            '';

          if (piece) sendEvent(res, 'delta', JSON.stringify({ text: piece }));
        } catch {
          // kartais tiekėjai įterpia kitų eventų – ignoruojam
        }
      }
    }

    sendEvent(res, 'done', JSON.stringify({ finish_reason: 'stop' }));
    endSSE(res);
  } catch (e) {
    sendEvent(res, 'error', JSON.stringify({ message: e.message || 'SSE klaida' }));
    endSSE(res);
  }
};

async function safeText(resp) {
  try { return await resp.text(); } catch { return ''; }
}
