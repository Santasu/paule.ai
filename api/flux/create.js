// /api/flux/create.js
module.exports = async (req, res) => {
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!process.env.TOGETHER_API_KEY) return res.status(400).json({ ok:false, error:"TOGETHER_KEY_MISSING" });

  const b = req.method === "POST" ? (req.body || {}) : {};
  const prompt = String(b.prompt || "");
  const style  = String(b.style  || "3d_1950s_realistic");
  const panels = parseInt(b.panels || 1, 10);

  if (!prompt) return res.status(400).json({ ok:false, error:"PROMPT_MISSING" });

  const prompt_full = panels > 1
    ? `Sukurk ${style} komiksą su ${panels} kadrais. Tema: ${prompt}`
    : prompt;

  const size = "1024x1024";
  const [w,h] = size.split("x").map(n=>parseInt(n,10)||1024);

  const r = await fetch("https://api.together.xyz/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.TOGETHER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "black-forest-labs/FLUX.1-schnell",
      prompt: prompt_full, width: w, height: h, n: 1, response_format: "url"
    })
  });

  const j = await r.json();
  const url = j?.data?.[0]?.url || "";
  if (!url) return res.status(502).json({ ok:false, error: j?.error?.message || "Image generation failed", raw:j });

  res.status(200).json({ ok:true, model:"black-forest-labs/FLUX.1-schnell", prompt_used:prompt_full, image_url:url, image_size:`${w}x${h}` });
};
