const { env, readBody, sendJSON } = require("../_utils");

module.exports = async (req, res) => {
  if (req.method !== "POST") return sendJSON(res, 405, { ok:false, error:"METHOD_NOT_ALLOWED" });
  if (!env.RUNWAY_KEY) return sendJSON(res, 400, { ok:false, error:"RUNWAY_KEY_MISSING" });

  const p = await readBody(req);
  const promptText = String(p.promptText || p.prompt || "").trim();
  const ratio      = String(p.ratio || "1280:720");
  const model      = String(p.model || "gen4_image");
  const seed       = Number.isInteger(p.seed) ? p.seed : undefined;
  const referenceImages = Array.isArray(p.referenceImages) ? p.referenceImages : undefined;
  const contentModeration = (p.contentModeration && typeof p.contentModeration === "object") ? p.contentModeration : undefined;

  if (!promptText) return sendJSON(res, 400, { ok:false, error:"PROMPT_MISSING" });

  const body = { model, promptText, ratio };
  if (seed !== undefined) body.seed = seed;
  if (referenceImages) body.referenceImages = referenceImages;
  if (contentModeration) body.contentModeration = contentModeration;

  const r = await fetch(`${env.RUNWAY_BASE}/text_to_image`, {
    method:"POST",
    headers:{
      "Authorization":`Bearer ${env.RUNWAY_KEY}`,
      "Content-Type":"application/json",
      "Accept":"application/json",
      "X-Runway-Version":"2024-11-06"
    },
    body: JSON.stringify(body)
  });

  const j = await r.json().catch(()=> ({}));
  if (!r.ok || !j?.id) return sendJSON(res, 502, { ok:false, error:"RUNWAY_BAD_RESPONSE", status:r.status, raw:j });

  sendJSON(res, 200, { ok:true, task_id:j.id });
};
