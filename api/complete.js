// api/complete.js
const { jsonOK, jsonERR, guessProvider, pickAutoModel } = require('../_utils');
const { getEnv } = require('../_auth');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.end(); return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST'); return res.status(405).end('Method Not Allowed');
  }

  try {
    const { message = '', models = '', chat_id = '', max_tokens = 1024 } = await readBody(req);
    const env = getEnv();

    // Modelių sąrašas
    let list = [];
    if (typeof models === 'string' && models.trim()) {
      list = models.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (!list.length) list = ['auto'];

    // auto → realus modelis
    list = list.map(m => (m === 'auto' ? pickAutoModel(env) : m));

    // Paleidžiam VISUS PARALALIAI
    const promises = list.map(m => inferOnce({ env, model: m, message, max_tokens }));
    const results = await Promise.allSettled(promises);

    const answers = [];
    results.forEach((r, i) => {
      const model = list[i];
      if (r.status === 'fulfilled' && r.value && r.value.ok && r.value.text) {
        answers.push({ model, text: r.value.text });
      }
      // jei norim – galim jungti klaidas į answers su error lauku,
      // bet UI vis tiek parodys klaidas apačioje (pamatys, kad to front'o negrįžo atsakymas)
    });

    return jsonOK(res, { ok: true, chat_id, answers });
  } catch (e) {
    return jsonERR(res, { ok: false, error: { message: e.message || 'Server error' } }, 500);
  }
};

// --- pagalba ---
async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', ch => data += ch);
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

async function inferOnce({ env, model, message, max_tokens }) {
  const provider = guessProvider(model);
  const sysPrompt = env.SYSTEM_PROMPT ? env.SYSTEM_PROMPT : null;
  const maxTok = Number(max_tokens) || 1024;
  const temperature = 0.7;

  try {
    if (provider === 'openai') {
      if (!env.OPENAI) throw new Error('OPENAI_API_KEY nerastas');
      const url = 'https://api.openai.com/v1/chat/completions';
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.OPENAI}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          stream: false,
          max_tokens: maxTok,
          temperature,
          messages: [
            ...(sysPrompt ? [{ role: 'system', content: sysPrompt }] : []),
            { role: 'user', content: String(message || '') }
          ]
        })
      });
      if (!r.ok) throw new Error(`OpenAI HTTP ${r.status} — ${await r.text()}`);
      const j = await r.json();
      const txt = j?.choices?.[0]?.message?.content || '';
      return { ok: true, text: txt };
    }

    if (provider === 'anthropic') {
      if (!env.ANTHROPIC) throw new Error('ANTHROPIC_API_KEY nerastas');
      const url = 'https://api.anthropic.com/v1/messages';
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'x-api-key': env.ANTHROPIC,
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTok,
          temperature,
          messages: [
            ...(sysPrompt ? [{ role: 'system', content: sysPrompt }] : []),
            { role: 'user', content: String(message || '') }
          ]
        })
      });
      if (!r.ok) throw new Error(`Anthropic HTTP ${r.status} — ${await r.text()}`);
      const j = await r.json();
      const txt = (j?.content && Array.isArray(j.content) ? j.content.map(p => p?.text || '').join('') : '') || '';
      return { ok: true, text: txt };
    }

    if (provider === 'google') {
      if (!env.GOOGLE) throw new Error('GOOGLE_API_KEY nerastas');
      // Dvi strategijos:
      // 1) jei model startsWith("gemini-") – bandome "generateContent"
      // 2) kitu atveju – naudojam "text-bison-001:generateText" (PaLM2)
      let url, body;
      if (String(model).startsWith('gemini-')) {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${env.GOOGLE}`;
        body = { contents: [{ parts: [{ text: (sysPrompt ? sysPrompt + '\n\n' : '') + String(message || '') }] }] };
      } else {
        const useModel = 'text-bison-001';
        url = `https://generativelanguage.googleapis.com/v1beta2/models/${useModel}:generateText?key=${env.GOOGLE}`;
        body = { prompt: { text: (sysPrompt ? sysPrompt + '\n\n' : '') + String(message || '') }, temperature, maxOutputTokens: maxTok };
      }
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!r.ok) throw new Error(`Google GenAI HTTP ${r.status} — ${await r.text()}`);
      const j = await r.json();
      // generateContent → j.candidates[0].content.parts[0].text
      // generateText    → j.candidates[0].output
      const txt =
        j?.candidates?.[0]?.content?.parts?.map(p => p?.text || '').join('') ||
        j?.candidates?.[0]?.output ||
        '';
      return { ok: true, text: txt };
    }

    if (provider === 'xai') {
      if (!env.XAI) throw new Error('XAI_API_KEY nerastas');
      const url = 'https://api.x.ai/v1/chat/completions';
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.XAI}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          stream: false,
          temperature,
          messages: [
            ...(sysPrompt ? [{ role: 'system', content: sysPrompt }] : []),
            { role: 'user', content: String(message || '') }
          ]
        })
      });
      if (!r.ok) throw new Error(`xAI HTTP ${r.status} — ${await r.text()}`);
      const j = await r.json();
      const txt = j?.choices?.[0]?.message?.content || '';
      return { ok: true, text: txt };
    }

    if (provider === 'deepseek') {
      if (!env.DEEPSEEK) throw new Error('DEEPSEEK_API_KEY nerastas');
      const url = 'https://api.deepseek.com/chat/completions';
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.DEEPSEEK}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          stream: false,
          max_tokens: maxTok,
          temperature,
          messages: [
            ...(sysPrompt ? [{ role: 'system', content: sysPrompt }] : []),
            { role: 'user', content: String(message || '') }
          ]
        })
      });
      if (!r.ok) throw new Error(`DeepSeek HTTP ${r.status} — ${await r.text()}`);
      const j = await r.json();
      const txt = j?.choices?.[0]?.message?.content || '';
      return { ok: true, text: txt };
    }

    if (provider === 'together') {
      if (!env.TOGETHER) throw new Error('TOGETHER_API_KEY nerastas');
      const url = 'https://api.together.xyz/v1/chat/completions';
      const r = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.TOGETHER}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model,
          stream: false,
          max_tokens: maxTok,
          temperature,
          messages: [
            ...(sysPrompt ? [{ role: 'system', content: sysPrompt }] : []),
            { role: 'user', content: String(message || '') }
          ]
        })
      });
      if (!r.ok) throw new Error(`Together HTTP ${r.status} — ${await r.text()}`);
      const j = await r.json();
      const txt = j?.choices?.[0]?.message?.content || '';
      return { ok: true, text: txt };
    }

    // Jei tiekėjas nepažintas – nieko
    throw new Error('Nepalaikomas tiekėjas JSON režime');
  } catch (e) {
    return { ok: false, error: e.message || 'Klaida' };
  }
}
