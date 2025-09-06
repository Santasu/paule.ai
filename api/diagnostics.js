// /api/diagnostics.js
const { cors } = require("../lib/ai");

module.exports = async (_req, res) => {
  cors(res);
  const out = {};

  // Together ping (1 step image)
  if (process.env.TOGETHER_API_KEY) {
    const t0 = Date.now();
    try {
      const r = await fetch("https://api.together.xyz/v1/images/generations", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${process.env.TOGETHER_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "black-forest-labs/FLUX.1-schnell",
          prompt: "Ping", width: 512, height: 512, n: 1, steps: 1, response_format: "url"
        })
      });
      out.together = { ok: r.status === 200, latency_ms: Date.now() - t0 };
    } catch (e) {
      out.together = { ok:false, error:String(e.message||e) };
    }
  } else out.together = { ok:false, error:"MISSING_KEY" };

  out.suno   = { ok: !!process.env.SUNO_API_KEY };
  out.runway = { ok: !!process.env.RUNWAY_API_KEY };

  res.status(200).json({ ok:true, services: out });
};
