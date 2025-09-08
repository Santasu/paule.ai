// api/stream.js
const TOGETHER = (process.env.TOGETHER_API_KEY || "").trim();

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
function sseEnd(res){ res.write(`: bye\n\n`); res.end(); }

async function readBody(req){
  if (req.method === "GET") return {};
  const chunks=[]; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString("utf8") || "{}";
  try{ return JSON.parse(raw); }catch{ return {}; }
}

async function runModel(model, message){
  // Jei turi Together raktą ir modelis Llama – kviečiam Together.
  if (TOGETHER && (model.includes("llama") || model==="auto" || model==="paule-ai")){
    const togetherModel = "meta-llama/Llama-3.3-70B-Instruct-Turbo";
    const r = await fetch("https://api.together.xyz/v1/chat/completions",{
      method:"POST",
      headers:{
        "Authorization":`Bearer ${TOGETHER}`,
        "Content-Type":"application/json"
      },
      body: JSON.stringify({
        model: togetherModel,
        messages:[
          { role:"system", content:"Tu esi „Paule AI“. Atsakinėk trumpai ir aiškiai, lietuviškai." },
          { role:"user", content: message }
        ],
        temperature:0.7,
        max_tokens:400
      })
    });
    const j = await r.json().catch(()=> ({}));
    const out = j?.choices?.[0]?.message?.content || "";
    return out || `Atsakymas apie: "${message}" – Together OK (bet tuščia).`;
  }

  // Fallback be raktų (lokalus testas)
  return `Atsakymas apie: "${message}" – viskas veikia ✅`;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const mode = (url.searchParams.get("mode") || "").toLowerCase();
  const isOnce = req.method === "POST" || mode === "once";

  if (req.method === "OPTIONS"){ res.statusCode=204; return res.end(); }

  // ---- JSON (mode=once) ----
  if (isOnce){
    const body = await readBody(req);
    const message = (body.message || url.searchParams.get("message") || "Labas").slice(0, 2000);
    const models = String(body.models || body.model || url.searchParams.get("models") || "paule-ai")
      .split(",").map(s=>s.trim()).filter(Boolean);

    const answers = [];
    for (const m of models){
      const text = await runModel(m, message);
      answers.push({ model: m, text });
    }
    res.setHeader("Content-Type","application/json; charset=utf-8");
    res.setHeader("Cache-Control","no-store");
    return res.status(200).json({ ok:true, answers });
  }

  // ---- SSE ----
  const message = (url.searchParams.get("message") || "Labas").slice(0, 2000);
  const model = (url.searchParams.get("model") || url.searchParams.get("models") || "paule-ai");

  sseStart(res);
  const chat_id = "chat_"+Date.now();
  sseSend(res, "start", { chat_id });
  sseSend(res, "model_init", { model, panel:"auto", chat_id });

  try{
    const full = await runModel(model, message);
    // "srautam" gabaliukais:
    const parts = full.match(/.{1,120}/g) || [full];
    for (const p of parts){ sseSend(res, "delta", { model, panel:"auto", text: p }); }
    sseSend(res, "answer", { model, panel:"auto", text: full });
    sseSend(res, "model_done", { model, panel:"auto" });
    sseSend(res, "done", { ok:true, chat_id });
    sseEnd(res);
  }catch(e){
    sseSend(res, "error", { ok:false, error:String(e?.message || e) });
    sseEnd(res);
  }
};
