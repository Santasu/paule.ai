// /api/runway/status.js
module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!process.env.RUNWAY_API_KEY) return res.status(400).json({ ok:false, error:"RUNWAY_KEY_MISSING" });

  const id = String(req.query.task_id || req.query.id || "");
  if (!id) return res.status(400).json({ ok:false, error:"TASK_ID_MISSING" });

  const r = await fetch(`https://api.runwayml.com/v1/tasks/${encodeURIComponent(id)}`, {
    headers:{
      "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`,
      "Accept": "application/json",
      "X-Runway-Version": "2024-11-06"
    }
  });
  const j = await r.json();

  if (r.status === 404) return res.status(200).json({ ok:false, status:"NOT_FOUND", error:"TASK_NOT_FOUND" });
  if (!r.ok) return res.status(200).json({ ok:false, status:"PENDING", error:`HTTP_${r.status}`, raw:j });

  const status = String(j?.status || "PENDING").toUpperCase();
  const output = Array.isArray(j?.output) ? j.output : [];
  const url = output[0] || null;

  res.status(200).json({ ok:true, status, output, url, raw:j });
};
