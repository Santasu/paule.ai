// /api/complete.js — JSON "once" endpoint (Claude, Gemini, Grok ir pan.)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const utils = require('../_utils.js');

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
} = utils;

export default async function handler(req, res) {
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
    const temperature = (typeof body?.temperature === 'number') ? body.temperature : 0.55;

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

        const out = await inferOnce(model, messages, { maxTokens, temperature });
        if (out?.ok && out?.output) {
          answers.push({ model: out.selected_model || model, text: out.output });
        } else {
          // pridėkim tuščią su klaida – kad UI suprastų
          answers.push({ model, text: `⚠️ (${model}) klaida: ${out?.error || 'NO_OUTPUT'}` });
        }
      } catch (e) {
        answers.push({ model: raw, text: `⚠️ (${raw}) išimtis: ${String(e?.message||e)}` });
      }
    }

    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ ok:true, chat_id: chatId, answers });

  } catch (e) {
    // Net jei kažkas labai blogai – grąžinam 200 su ok:false (kad UI negautų 500)
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ ok:false, error: String(e?.message || e) });
  }
}

