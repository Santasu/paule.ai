// api/stream.js
const {
  env, readBody, sseStart, sseSend, sseEnd,
  pickAutoModel, guessProvider, aliasOf, systemLT,
  openaiCompatStream, inferOnce
} = require('./_utils');

module.exports = async (req, res) => {
  // ----- JSON once (Claude/Gemini/Grok ir pan.) -----
  if (req.method === 'POST') {
    const body = await readBody(req);
    const msg = String(body.message || body.prompt || '').slice(0, 4000);
    const models = String(body.models || body.model || 'auto').split(',').map(s=>s.trim()).filter(Boolean);
    if (!msg || !models.length) return json(res, 400, { ok:false, error:'BAD_REQUEST' });

    const answers = [];
    for (const m of models) {
      const model = (m === 'auto') ? pickAutoModel() : m;
      const out = await inferOnce(model, [
        { role:'system', content:systemLT(aliasOf(model), model, guessProvider(model)) },
        { role:'user', content: msg }
      ], { maxTokens: 1024, temperature: 0.6 });
      answers.push({ model, text: out.output || '' });
    }
    return json(res, 200, { ok:true, mode:'once', answers });
  }

  // ----- SSE (OpenAI-compatible stream) -----
  const url = new URL(req.url, 'http://localhost');
  const message = (url.searchParams.get('message') || '').slice(0, 4000);
  let model = url.searchParams.get('model') || url.searchParams.get('models') || 'auto';
  if (!message) return json(res, 400, { ok:false, error:'MESSAGE_MISSING' });

  if (model === 'auto') model = pickAutoModel();
  const provider = guessProvider(model);
  const alias = aliasOf(model);

  sseStart(res);
  const chat_id = 'chat_' + Date.now();
  sseSend(res, 'start', { chat_id });
  sseSend(res, 'model_init', { chat_id, model, panel:'auto' });

  // OpenAI-compatible tiekėjai (stream:true)
  const prov = {
    openai:   { url: 'https://api.openai.com/v1/chat/completions', key: env.OPENAI,   header: 'Authorization' },
    together: { url: 'https://api.together.xyz/v1/chat/completions', key: env.TOGETHER, header: 'Authorization' },
    deepseek: { url: 'https://api.deepseek.com/chat/completions', key: env.DEEPSEEK, header: 'Authorization' },
    xai:      { url: 'https://api.x.ai/v1/chat/completions',      key: env.XAI,      header: 'Authorization' },
  };

  if (prov[provider] && prov[provider].key) {
    const { url: apiURL, key, header } = prov[provider];
    await openaiCompatStream({
      url: apiURL,
      headers: { [header]: `Bearer ${key}`, 'Content-Type': 'application/json' },
      payload: {
        model,
        stream: true,
        temperature: 0.6,
        max_tokens: 1024,
        messages: [
          { role:'system', content: systemLT(alias, model, provider) },
          { role:'user', content: message }
        ]
      },
      res,
      meta:{ provider, model, alias }
    });
    sseSend(res, 'model_done', { model, panel:'auto' });
    sseSend(res, 'done', { ok:true, chat_id });
    return sseEnd(res);
  }

  // Fallback (jei nėra rakto / ne OpenAI-compatible tiekėjas)
  const txt = `Atsakymas apie: "${message}" – viskas veikia ✅`;
  sseSend(res, 'delta',  { model, panel:'auto', text: txt });
  sseSend(res, 'answer', { model, panel:'auto', text: txt });
  sseSend(res, 'model_done', { model, panel:'auto' });
  sseSend(res, 'done', { ok:true, chat_id });
  return sseEnd(res);
};

function json(res, code, obj){
  res.statusCode = code;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store');
  res.end(JSON.stringify(obj));
}

