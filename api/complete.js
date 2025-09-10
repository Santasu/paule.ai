// api/complete.js
const {
  readBody,
  sendJSON,
  nocache,
  pickAutoModel,
  normalizeModelId,
  aliasOf,
  guessProvider,
  inferOnce,
  systemLT,
} = require('../_utils.js');

module.exports = async function handler(req, res) {
  // CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return sendJSON(res, 405, { ok:false, error: 'Method Not Allowed' });
  }

  try {
    nocache(res);

    const body = await readBody(req);
    const user = String(body?.message || '');
    const ids  = String(body?.models || '').split(',').map(s=>s.trim()).filter(Boolean);
    const chatId = body?.chat_id || ('chat_'+Date.now()+'_'+Math.random().toString(36).slice(2));
    const maxTokens = Math.max(1, Math.min(4096, Number(body?.max_tokens || 1024)));

    // jei nieko nepaduota – auto
    const models = ids.length ? ids : ['auto'];
    const answers = [];

    for (const raw of models) {
      try {
        const model = (raw === 'auto') ? pickAutoModel() : normalizeModelId(raw);
        const provider = guessProvider(model);
        const sys = systemLT(aliasOf(model), model, provider);
        const messages = [
          { role:'system', content: sys },
          { role:'user',   content: user }
        ];

        const out = await inferOnce(model, messages, { maxTokens, temperature: 0.55 });
        if (out?.ok && out?.output) {
          answers.push({ model: out.selected_model || model, text: out.output });
        }
      } catch (e) {
        // vieno modelio klaida neturi numušti visos funkcijos
        // tiesiog nepridedam į answers
      }
    }

    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ ok:true, chat_id: chatId, answers });

  } catch (e) {
    // Kad UI nemestų "HTTP 500", vis tiek grąžinam 200 su ok:false
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ ok:false, error: String(e?.message || e) });
  }
};
