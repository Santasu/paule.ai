const { env, readBody, sendJSON } = require("../_utils");

// Naudojame Suno community API gateway (sunoapi.org)
module.exports = async (req, res) => {
  if (req.method !== "POST") return sendJSON(res, 405, { ok:false, error:"METHOD_NOT_ALLOWED" });
  if (!env.SUNO_KEY) return sendJSON(res, 200, { ok:false, error:"SUNO_KEY_MISSING" });

  const p = await readBody(req);

  const body = {
    customMode: !!p.customMode,
    instrumental: !!p.instrumental,
    model: String((p.model || "V3_5")).toUpperCase(),
    callBackUrl: String(process.env.SUNO_CALLBACK_URL || ""),
  };

  if (body.customMode){
    body.style = String(p.style || "");
    body.title = String(p.title || "");
    if (!p.instrumental) body.prompt = String(p.prompt || ""); // lyrics
    if (p.negativeTags) body.negativeTags = String(p.negativeTags);
    if (p.vocalGender)  body.vocalGender  = String(p.vocalGender);
    if (p.styleWeight != null)         body.styleWeight         = Math.max(0, Math.min(1, Number(p.styleWeight)));
    if (p.weirdnessConstraint != null) body.weirdnessConstraint = Math.max(0, Math.min(1, Number(p.weirdnessConstraint)));
    if (p.audioWeight != null)         body.audioWeight         = Math.max(0, Math.min(1, Number(p.audioWeight)));
  } else {
    body.prompt = String(p.prompt || "");
  }

  if (p.genre) body.genre = String(p.genre);
  if (p.mood)  body.mood  = String(p.mood);
  if (p.instruments){
    const arr = Array.isArray(p.instruments) ? p.instruments : String(p.instruments).split(",").map(s=>s.trim()).filter(Boolean);
    if (arr.length) body.instruments = arr;
  }

  const r = await fetch(`${env.SUNO_BASE}/api/v1/generate`,{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${env.SUNO_KEY}`,
      "Content-Type":"application/json",
      "Accept":"application/json"
    },
    body: JSON.stringify(body)
  });

  const j = await r.json().catch(()=> ({}));
  const code = Number(j?.code || 0);
  if (r.status !== 200 || code !== 200){
    return sendJSON(res, 200, { ok:false, error: j?.msg || "Suno error", raw:j, status_code:r.status });
  }

  const taskId = j?.data?.taskId || null;
  const audioUrl = j?.data?.response?.data?.[0]?.audio_url || j?.audio_url || null;

  if (taskId) return sendJSON(res, 200, { ok:true, status:"queued", task_id: taskId });
  if (audioUrl) return sendJSON(res, 200, { ok:true, status:"ready", audio_url: audioUrl, source:"create" });

  sendJSON(res, 200, { ok:false, error:"SUNO_NO_TASKID", raw:j });
};
