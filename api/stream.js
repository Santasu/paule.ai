// /api/stream.js
const { PROVIDERS, guessProvider, autoModel, cors } = require("../lib/ai");

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();

  const q = req.method === "GET" ? req.query : (req.body || {});
  const message = String(q.message || q.prompt || "");
  if (!message) return res.status(400).json({ ok:false, error:"PROMPT_MISSING" });

  const mode = String(q.mode || (req.method === "GET" ? "sse" : "once")).toLowerCase();
  const modelIn = q.models || q.model || "auto";
  const model = modelIn === "auto" ? autoModel() : String(modelIn);
  const provider = guessProvider(model);

  // === JSON "once" (vienkartinis) ===
  if (mode === "once" || req.method === "POST") {
    try {
      const out = await inferOnce({ provider, model, message });
      return res.status(200).json({ ok:true, model, provider, text: out });
    } catch (e) {
      return res.status(500).json({ ok:false, error:String(e.message||e) });
    }
  }

  // === Tikras SSE (OpenAI-compatible srautas) ===
  if (!["openai","together","deepseek","xai"].includes(provider)) {
    // tiems tiekėjams, kuriems nepalaikome SSE, grąžinam fallback JSON
    try {
      const out = await inferOnce({ provider, model, message });
      return res.status(200).json({ ok:true, model, provider, text: out, streamed:false });
    } catch (e) {
      return res.status(500).json({ ok:false, error:String(e.message||e) });
    }
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const conf = PROVIDERS[provider];
  if (!conf?.key) {
    sendSSE(res, "error", { error:`${provider.toUpperCase()}_KEY_MISSING` });
    return res.end();
  }

  const payload = {
    model,
    messages: [{ role:"user", content: message }],
    temperature: 0.55,
    max_tokens: 1024,
    stream: true
  };
  const headers = {
    "Content-Type": "application/json",
    "Accept": "text/event-stream"
  };
  if (conf.header === "Authorization") headers.Authorization = `Bearer ${conf.key}`;
  else headers[conf.header] = conf.key;

  const r = await fetch(conf.url, {
    method:"POST",
    headers,
    body: JSON.stringify(payload)
  });

  if (!r.ok || !r.body) {
    sendSSE(res, "error", { error:`HTTP_${r.status}` });
    return res.end();
  }

  sendSSE(res, "start", { ok:true, model, provider });

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream:true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith(":")) continue;
      if (!line.toLowerCase().startsWith("data:")) continue;

      const data = line.slice(5).trim();
      if (data === "[DONE]") { sendSSE(res, "done", { ok:true }); return res.end(); }

      try {
        const obj = JSON.parse(data);
        const delta = obj?.choices?.[0]?.delta?.content ?? obj?.choices?.[0]?.message?.content ?? obj?.text ?? "";
        if (delta) sendSSE(res, "delta", { text: delta });
      } catch {
        // ignore parse errors
      }
    }
  }

  sendSSE(res, "done", { ok:true });
  res.end();
};

function sendSSE(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function inferOnce({ provider, model, message }) {
  const conf = PROVIDERS[provider];
  if (!conf?.key) throw new Error(`${provider.toUpperCase()}_KEY_MISSING`);

  if (provider === "anthropic") {
    const r = await fetch(conf.url, {
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "anthropic-version":"2023-06-01",
        [conf.header]: conf.key
      },
      body: JSON.stringify({
        model, max_tokens: 1024,
        messages: [{ role:"user", content:[{ type:"text", text: message }] }]
      })
    });
    const j = await r.json();
    return j?.content?.[0]?.text || "";
  }

  if (provider === "google") {
    const r = await fetch(`${conf.url}/models/${encodeURIComponent(model)}:generateContent?key=${conf.key}`, {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({
        contents: [{ role:"user", parts:[{ text: message }] }],
        generationConfig: { temperature: 0.55, maxOutputTokens: 1024 }
      })
    });
    const j = await r.json();
    const cand = j?.candidates?.[0];
    if (cand?.content?.parts?.length) {
      return cand.content.parts.map(p=>p.text||"").join("");
    }
    return cand?.text || "";
  }

  // OpenAI-compatible JSON
  const r = await fetch(conf.url, {
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      [conf.header]: conf.header === "Authorization" ? `Bearer ${conf.key}` : conf.key
    },
    body: JSON.stringify({
      model,
      messages: [{ role:"user", content: message }],
      temperature: 0.55,
      max_tokens: 1024,
      stream: false
    })
  });
  const j = await r.json();
  return j?.choices?.[0]?.message?.content || j?.choices?.[0]?.text || "";
}
