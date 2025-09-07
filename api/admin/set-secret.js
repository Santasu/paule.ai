// api/admin/set-secret.js
const { ADMIN, ALLOWED_ORIGIN } = require("../../lib/env");

const MAP = {
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  google: "GOOGLE_API_KEY",
  xai: "XAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  together: "TOGETHER_API_KEY",
  runway: "RUNWAY_API_KEY",
  suno: "SUNO_API_KEY",
  flux: "FLUX_API_KEY"
};

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ ok:false, error:"Method not allowed" });

  try {
    if (!ADMIN.TOKEN || !ADMIN.PROJECT_ID || !ADMIN.SECRET) {
      return res.status(501).json({ ok:false, error:"Not configured (VERCEL_TOKEN/PROJECT_ID/ADMIN_SECRET missing)" });
    }

    const { provider, value, target = "production", adminSecret } = req.body || {};
    if (!provider || typeof provider !== "string") throw new Error("provider required");
    if (!adminSecret || adminSecret !== ADMIN.SECRET) throw new Error("invalid ADMIN_SECRET");
    const key = MAP[provider];
    if (!key) throw new Error("unknown provider");
    if (!value) throw new Error("value required");

    // Vercel API: upsert env
    const url = `https://api.vercel.com/v10/projects/${encodeURIComponent(ADMIN.PROJECT_ID)}/env?upsert=1`;
    const payload = {
      key,
      value,
      type: "encrypted",
      target: [target] // pvz. ["production"] arba ["production","preview","development"]
    };

    const r = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${ADMIN.TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const out = await r.json();
    if (!r.ok) return res.status(r.status).json({ ok:false, error: out.error?.message || JSON.stringify(out) });

    return res.status(200).json({ ok:true, result: out });
  } catch (e) {
    res.status(500).json({ ok:false, error: String(e && e.message || e) });
  }
};
