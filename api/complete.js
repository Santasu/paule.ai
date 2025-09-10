// /api/complete.js — JSON "once" endpoint tik ne-SSE modeliams (Claude, Gemini, Grok ir kt.)
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { readBody, inferOnce, systemLT, aliasOf, guessProvider, sendJSON } = require('./_utils.js');

export default async function handler(req, res) {
  // CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.statusCode = 204;
    return res.end();
  }
  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return sendJSON(res, 405, { ok:false, error:'Method Not Allowed' });
  }

  try {
    const body = await readBody(req);
    const message = String(body?.message ?? '');
    const modelsStr = String(body?.models ?? '');
    const chatId = body?.chat_id || ('chat_'+Date.now()+'_'+Math.random().toString(36).slice(2));
    const maxTokens = Math.min(4096, Number(body?.max_tokens) || 4096);
    const temperature = (typeof body?.temperature === 'number') ? body.temperature : 0.55;

    const backIds = modelsStr.split(',').map(s=>s.trim()).filter(Boolean);
    if (!message || backIds.length === 0) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      return sendJSON(res, 400, { ok:false, error:'message_or_models_missing' });
    }

    // Lygiagretūs kvietimai visiems nurodytiems modeliams
    const answers = await Promise.all(backIds.map(async (model) => {
      const sys = systemLT(aliasOf(model), model, guessProvider(model));
      const msgs = [
        { role:'system', content: sys },
        { role:'user',   content: message }
      ];
      try{
        const out = await inferOnce(model, msgs, { maxTokens, temperature });
        if (out?.ok && out?.output) return { model, text: out.output };
        const err = out?.error || 'NO_OUTPUT';
        return { model, text: `⚠️ (${model}) klaida: ${err}` };
      }catch(e){
        return { model, text: `⚠️ (${model}) išimtis: ${String(e?.message||e)}` };
      }
    }));

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok:true, chat_id: chatId, answers }));
  } catch (e) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok:false, error:String(e?.message||e) }));
  }
}
