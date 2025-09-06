const { env, sendJSON } = require("../_utils");

module.exports = async (req, res) => {
  if (!env.RUNWAY_KEY) return sendJSON(res, 400, { ok:false, error:"RUNWAY_KEY_MISSING" });
  const id = String(req.query.task_id || req.query.id || "").trim();
  if (!id) return sendJSON(res, 400, { ok:false, error:"TASK_ID_MISSING" });

  const r = await fetch(`${env.RUNWAY_BASE}/tasks/${encodeURIComponent(id)}`, {
    headers:{
      "Authorization":`Bearer ${env.RUNWAY_KEY}`,
      "Accept":"application/json",
      "X-Runway-Version":"2024-11-06"
    }
  });

  const j = await r.json().catch(()=> ({}));
  if (r.status === 404) return sendJSON(res, 200, { ok:false, status:"NOT_FOUND", error:"TASK_NOT_FOUND" });
  if (!r.ok) return sendJSON(res, 200, { ok:false, status:"PENDING", error:`RUNWAY_STATUS_HTTP_${r.status}`, raw:j });

  const status = String(j?.status || "PENDING").toUpperCase();
  const out = Array.isArray(j?.output) ? j.output : [];
  sendJSON(res, 200, { ok:true, status, output: out, url: out?.[0] || null, raw: j });
};
