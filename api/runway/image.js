const RUNWAY_URL = 'https://api.dev.runwayml.com/v1';
const RUNWAY_KEY = process.env.RUNWAYML_API_SECRET; // pagal jų docs
const RUNWAY_VER = '2024-11-06';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method Not Allowed' });
    if (!RUNWAY_KEY) return res.status(200).json({ ok:false, error:'Set RUNWAYML_API_SECRET in Vercel' });

    const { image_url, image_data, prompt, duration = 5, ratio = '1280:720', model = 'gen4_turbo' } = req.body || {};
    const promptImage = image_data || image_url;
    if (!promptImage) return res.status(400).json({ ok:false, error:'Provide image_url or image_data (data URI)' });

    const r = await fetch(`${RUNWAY_URL}/image_to_video`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RUNWAY_KEY}`,
        'X-Runway-Version': RUNWAY_VER,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        promptImage,
        promptText: prompt || 'cinematic motion',
        model,
        ratio,
        duration: Number(duration) || 5
      })
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ ok:false, error: j.message || 'Runway create failed' });

    return res.status(200).json({ ok:true, task_id: j.id || j.taskId || j.task_id || null });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'runway/image error' });
  }
}
