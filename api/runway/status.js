const RUNWAY_URL = 'https://api.dev.runwayml.com/v1';
const RUNWAY_KEY = process.env.RUNWAYML_API_SECRET;
const RUNWAY_VER = '2024-11-06';

export default async function handler(req, res) {
  try {
    const id = (req.query.task || req.query.task_id || '').toString();
    if (!id) return res.status(400).json({ ok:false, error:'Missing task' });
    if (!RUNWAY_KEY) {
      // demo
      return res.status(200).json({
        ok: true, status: 'ready',
        video_url: 'https://sample-videos.com/video321/mp4/720/big_buck_bunny_720p_1mb.mp4',
        cover_url: 'https://placehold.co/1024x576/jpg?text=Video'
      });
    }

    const r = await fetch(`${RUNWAY_URL}/tasks/${encodeURIComponent(id)}`, {
      headers: {
        'Authorization': `Bearer ${RUNWAY_KEY}`,
        'X-Runway-Version': RUNWAY_VER
      }
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ ok:false, error: j.message || 'Runway status failed' });

    const status = j.status || j.state || 'pending';
    const output = Array.isArray(j.output) ? j.output[0] : (j.output_url || j.video || null);

    return res.status(200).json({
      ok: true,
      status,
      video_url: output || '',
      cover_url: j?.assets?.cover || ''
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'runway/status error' });
  }
}
