// /api/runway/image.js
module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!process.env.RUNWAY_API_KEY) return res.status(400).json({ ok:false, error:"RUNWAY_KEY_MISSING" });

  const b = req.method === "POST" ? (req.body || {}) : {};
  const promptText = String(b.promptText || b.prompt || "");
  const ratio = String(b.ratio || "1280:720");
  const model = String(b.model || "gen4_image");
  const seed  = b.seed != null ? Number(b.seed) : undefined;

  if (!promptText) return res.status(400).json({ ok:false, error:"PROMPT_MISSING" });

  const body = { model, promptText, ratio };
  if (seed != null) body.seed = seed;

  const r = await fetch("https://api.runwayml.com/v1/text_to_image", {
    method:"POST",
    headers:{
      "Authorization": `Bearer ${process.env.RUNWAY_API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Runway-Version": "2024-11-06"
    },
    body: JSON.stringify(body)
  });

  const j = await r.json();
  if (!r.ok || !j?.id) return res.status(502).json({ ok:false, error:"RUNWAY_BAD_RESPONSE", status:r.status, raw:j });
  res.status(200).json({ ok:true, task_id:j.id });
};
