const {
  env, readBody, sendJSON, pickAutoModel, normalizeModelId, guessProvider,
  systemLT, aliasOf, inferOnce, sseStart, sseSend, sseEnd, openaiCompatStream
} = require("./_utils");

// GET -> SSE; POST -> JSON (non-stream)
// Params: message | prompt; model (or "auto")
module.exports = async (req, res) => {
  if (req.method === "OPTIONS") { res.status(204).end(); return; }

  const q = req.query || {};
  const body = await readBody(req);
  const userPrompt = String(q.message || q.prompt || body.message || body.prompt || "").trim();
  if (!userPrompt) return sendJSON(res, 400, { ok:false, error:"PROMPT_MISSING" });

  const modelIn = normalizeModelId(q.model || body.model || "auto");
  const model = (modelIn === "auto") ? pickAutoModel() : modelIn;
  const provider = guessProvider(model);
  const alias = aliasOf(model);

  // POST JSON (once)
  if (req.method === "POST") {
    const sys = systemLT(alias, model, provider);
    const messages = [];
    if (sys) messages.push({ role:"system", content: sys });
    messages.push({ role:"user", content: userPrompt });
    const resp = await inferOnce(model, messages, { maxTokens:4096, temperature:0.55 });
    return sendJSON(res, 200, {
      ok: !!resp.ok, model, alias, provider,
      text: resp.output || "", error: resp.error || null
    });
  }

  // GET SSE
  sseStart(res);
  sseSend(res,"start",{ ok:true, model, alias, provider });

  // Providers su OpenAI-compatible srautu
  if (["openai","together","deepseek","xai"].includes(provider)) {
    const map = {
      openai:   { url:"https://api.openai.com/v1/chat/completions", key: env.OPENAI },
      together: { url:"https://api.together.xyz/v1/chat/completions", key: env.TOGETHER },
      deepseek: { url:"https://api.deepseek.com/chat/completions", key: env.DEEPSEEK },
      xai:      { url:"https://api.x.ai/v1/chat/completions", key: env.XAI },
    };
    const {url, key} = map[provider];
    if (!key) {
      sseSend(res,"answer",{ ok:false, error:`${provider.toUpperCase()}_KEY_MISSING` });
      return sseEnd(res);
    }
    const sys = systemLT(alias, model, provider);
    const messages = [];
    if (sys) messages.push({ role:"system", content: sys });
    messages.push({ role:"user", content: userPrompt });

    await openaiCompatStream({
      url,
      headers:{ "Authorization":`Bearer ${key}`, "Content-Type":"application/json", "Accept":"text/event-stream" },
      payload:{ model, messages, temperature:0.55, max_tokens:4096, stream:true },
      res,
      meta:{ provider, model, alias }
    });

    sseSend(res,"done",{ ok:true });
    return sseEnd(res);
  }

  // Fallback – be streaming
  const sys = systemLT(alias, model, provider);
  const messages = [];
  if (sys) messages.push({ role:"system", content: sys });
  messages.push({ role:"user", content: userPrompt });
  const r = await inferOnce(model, messages, { maxTokens:4096 });
  sseSend(res,"answer",{ ok:!!r.ok, text:r.output||"", error:r.error||null, model, alias, provider });
  sseSend(res,"done",{ ok: !!r.ok });
  sseEnd(res);
};
