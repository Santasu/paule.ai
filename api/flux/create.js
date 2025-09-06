const { env, readBody, sendJSON } = require("../_utils");

module.exports = async (req, res) => {
  if (req.method !== "POST") return sendJSON(res, 405, { ok:false, error:"METHOD_NOT_ALLOWED" });
  if (!env.TOGETHER) return sendJSON(res, 400, { ok:false, error:"TOGETHER_KEY_MISSING" });

  const p = await readBody(req);
  const prompt = String(p.prompt || "").trim();
  const panels = Number(p.panels || 1);
  const style  = String(p.style || "3d_1950s_realistic");

  if (!prompt) return sendJSON(res, 400, { ok:false, error:"PROMPT_MISSING" });

  const prompt_full = panels > 1
    ? `Sukurk ${style} komiksą su ${panels} kadrais. Tema: ${prompt}`
    : prompt;

  const size = String(process.env.COMIC_IMAGE_SIZE || "1024x1024");
  const [w,h] = size.split("x").map(x=>parseInt(x,10)).filter(Boolean);
  const model = "black-forest-labs/FLUX.1-schnell";

  const r = await fetch("https://api.together.xyz/v1/images/generations",{
    method:"POST",
    headers:{
      "Authorization":`Bearer ${env.TOGETHER}`,
      "Content-Type":"application/json"
    },
    body: JSON.stringify({ model, prompt:prompt_full, width:w||1024, height:h||1024, n:1, response_format:"url" })
  });
  const j = await r.json().catch(()=> ({}));
  const url = j?.data?.[0]?.url || "";

  if (!url) return sendJSON(res, 502, { ok:false, error: j?.error?.message || "Image generation failed", raw:j });

  sendJSON(res, 200, { ok:true, model, prompt_used: prompt_full, image_url:url, image_size:`${w||1024}x${h||1024}` });
};
