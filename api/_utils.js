// Bendros pagalbinės funkcijos (Vercel Serverless, Node.js) 
// .env kintamieji (į Vercel Project Settings → Environment Variables):
// OPENAI_API_KEY, TOGETHER_API_KEY, ANTHROPIC_API_KEY, GOOGLE_API_KEY, XAI_API_KEY, DEEPSEEK_API_KEY
// RUNWAY_API_KEY, RUNWAY_API_BASE (opt, default https://api.runwayml.com/v1)
// SUNO_API_KEY, SUNO_API_BASE (opt, default https://api.sunoapi.org)

const env = {
  OPENAI: process.env.OPENAI_API_KEY || "",
  TOGETHER: process.env.TOGETHER_API_KEY || "",
  ANTHROPIC: process.env.ANTHROPIC_API_KEY || "",
  GOOGLE: process.env.GOOGLE_API_KEY || "",
  XAI: process.env.XAI_API_KEY || "",
  DEEPSEEK: process.env.DEEPSEEK_API_KEY || "",
  RUNWAY_KEY: process.env.RUNWAY_API_KEY || "",
  RUNWAY_BASE: (process.env.RUNWAY_API_BASE || "https://api.runwayml.com/v1").replace(/\/+$/,""),
  SUNO_KEY: process.env.SUNO_API_KEY || "",
  SUNO_BASE: (process.env.SUNO_API_BASE || "https://api.sunoapi.org").replace(/\/+$/,""),
};

function nocache(res){
  res.setHeader("Cache-Control","private, no-store, no-cache, must-revalidate, max-age=0");
  res.setHeader("Pragma","no-cache");
  res.setHeader("Expires","0");
  res.setHeader("X-Accel-Expires","0");
}

function sendJSON(res, code, obj){
  nocache(res);
  res.status(code).json(obj);
}

async function readBody(req){
  if (req.method === "GET") return {};
  try {
    if (!req.body) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString("utf8") || "{}";
      return JSON.parse(raw);
    }
    // Next.js gali jau būti suparsinęs
    return typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
  } catch {
    return {};
  }
}

function normalizeModelId(id=""){
  const raw = String(id || "").trim();
  const l = raw.toLowerCase();
  if (l === "gpt-5-mini" || l === "gpt5mini" || l === "gpt-5") return "gpt-4o-mini";
  if (l.includes("deepseek-v3")) return "deepseek-chat";
  if (l === "claude-4-sonnet-latest") return "claude-4-sonnet";
  return raw || "auto";
}

function guessProvider(model){
  const m = model.toLowerCase();
  if (m.includes("gpt") || m.includes("openai")) return "openai";
  if (m.includes("claude") || m.includes("anthropic")) return "anthropic";
  if (m.includes("gemini") || m.includes("google")) return "google";
  if (m.includes("grok") || m.includes("x.ai") || m === "grok-4") return "xai";
  if (m.includes("llama") || m.includes("meta-llama") || m.includes("/llama")) return "together";
  if (m.includes("deepseek")) return "deepseek";
  return "generic";
}

function pickAutoModel(){
  if (env.TOGETHER) return "meta-llama/Llama-4-Scout-17B-16E-Instruct";
  if (env.OPENAI)   return "gpt-4o-mini";
  if (env.ANTHROPIC)return "claude-4-sonnet";
  if (env.XAI)      return "grok-4";
  if (env.GOOGLE)   return "gemini-2.5-flash";
  if (env.DEEPSEEK) return "deepseek-chat";
  return "gpt-4o-mini";
}

function systemLT(alias, model, provider){
  return `Tu esi pagalbinis AI asistentas. Atsakinėk trumpai ir aiškiai, lietuviškai (jei neprašoma kitaip). Modelis: ${alias} (${model}; ${provider}).`;
}

function aliasOf(model){
  const m = model.toLowerCase();
  if (m.includes("gpt-4o")) return "ChatGPT 4o mini";
  if (m.includes("gpt-5"))  return "ChatGPT 5 mini";
  if (m.includes("claude")) return "Claude Sonnet";
  if (m.includes("gemini")) return "Gemini Flash";
  if (m.includes("grok"))   return "Grok 4";
  if (m.includes("llama"))  return "Llama";
  if (m.includes("deepseek"))return "DeepSeek";
  return model;
}

async function inferOnce(model, messages, {maxTokens=2048, temperature=0.55}={}){
  model = normalizeModelId(model);
  const prov = guessProvider(model);

  // OpenAI-compatible (OpenAI/Together/DeepSeek/xAI)
  if (["openai","together","deepseek","xai"].includes(prov)){
    const map = {
      openai:   { url: "https://api.openai.com/v1/chat/completions",         key: env.OPENAI },
      together: { url: "https://api.together.xyz/v1/chat/completions",       key: env.TOGETHER },
      deepseek: { url: "https://api.deepseek.com/chat/completions",          key: env.DEEPSEEK },
      xai:      { url: "https://api.x.ai/v1/chat/completions",               key: env.XAI },
    };
    const {url, key} = map[prov];
    if (!key) return {ok:false, error:`${prov.toUpperCase()}_KEY_MISSING`};

    const r = await fetch(url, {
      method:"POST",
      headers: { "Authorization":`Bearer ${key}`, "Content-Type":"application/json" },
      body: JSON.stringify({ model, messages, temperature, max_tokens:maxTokens }),
    });
    const j = await r.json().catch(()=> ({}));
    const out = j?.choices?.[0]?.message?.content || "";
    return { ok: !!out, output: out, provider: prov, selected_model: model, raw: j };
  }

  // Anthropic
  if (prov === "anthropic"){
    if (!env.ANTHROPIC) return {ok:false, error:"ANTHROPIC_KEY_MISSING"};
    const sysParts = messages.filter(m=>m.role==="system").map(m=>m.content).join("\n");
    const mm = messages.filter(m=>m.role!=="system").map(m=>({
      role: m.role==="assistant" ? "assistant" : "user",
      content: [{ type:"text", text: m.content }]
    }));
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method:"POST",
      headers:{
        "x-api-key":env.ANTHROPIC,
        "anthropic-version":"2023-06-01",
        "Content-Type":"application/json"
      },
      body: JSON.stringify({ model, max_tokens: maxTokens, system: sysParts || undefined, messages: mm })
    });
    const j = await r.json().catch(()=> ({}));
    const out = j?.content?.[0]?.text || "";
    return { ok: !!out, output: out, provider: prov, selected_model: model, raw: j };
  }

  // Google (Gemini)
  if (prov === "google"){
    if (!env.GOOGLE) return {ok:false, error:"GOOGLE_KEY_MISSING"};
    const sys = messages.filter(m=>m.role==="system").map(m=>m.content).join("\n");
    const contents = messages.filter(m=>m.role!=="system").map(m=>({
      role: m.role==="assistant" ? "model" : "user",
      parts:[{ text: m.content }]
    }));
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${env.GOOGLE}`;
    const r = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        contents,
        generationConfig:{ temperature, maxOutputTokens: maxTokens },
        systemInstruction: sys ? { parts:[{text:sys}] } : undefined
      })
    });
    const j = await r.json().catch(()=> ({}));
    const cand = j?.candidates?.[0];
    const parts = cand?.content?.parts || [];
    const out = parts.map(p=>p?.text || "").join("") || cand?.text || "";
    return { ok: !!out, output: out, provider: prov, selected_model: model, raw: j };
  }

  return { ok:false, error:"UNKNOWN_MODEL" };
}

// --- SSE helpers -----------------------------------------------------------
function sseStart(res){
  res.setHeader("Content-Type","text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control","no-cache, no-transform");
  res.setHeader("Connection","keep-alive");
  res.setHeader("X-Accel-Buffering","no");
  res.write(`: ping\n\n`);
}

function sseSend(res, event, data){
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function sseEnd(res){
  res.write(`: bye\n\n`);
  res.end();
}

async function openaiCompatStream({url, headers, payload, res, meta}){
  const r = await fetch(url, { method:"POST", headers, body: JSON.stringify(payload) });
  if (!r.ok || !r.body){
    sseSend(res,"answer",{ ok:false, error:`HTTP_${r.status}` });
    sseEnd(res); return;
  }
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of r.body){
    buffer += decoder.decode(chunk, { stream: true });
    let lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines){
      const ln = line.trim();
      if (!ln || ln.startsWith(":")) continue;
      if (!ln.toLowerCase().startsWith("data:")) continue;
      const data = ln.slice(5).trim();
      if (data === "[DONE]") continue;
      let obj; try { obj = JSON.parse(data); } catch { continue; }
      const c = obj?.choices?.[0];
      const delta = c?.delta?.content ?? c?.message?.content ?? c?.text ?? "";
      if (delta){
        sseSend(res, "delta", { text: delta, provider: meta.provider, model: meta.model, alias: meta.alias });
      }
    }
  }
}

module.exports = {
  env,
  nocache,
  sendJSON,
  readBody,
  normalizeModelId,
  guessProvider,
  pickAutoModel,
  systemLT,
  aliasOf,
  inferOnce,
  sseStart,
  sseSend,
  sseEnd,
  openaiCompatStream,
};
