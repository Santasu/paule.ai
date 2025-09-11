// Vercel Serverless (Node 18+)
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    const SUNO_API_KEY = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';

    if (!SUNO_API_KEY) {
      // Leisti UI veikti be realaus rakto (demo)
      // Grąžinam iškart "task_id", kad /status greitai duotų "ready".
      const mockTask = 'demo-' + Date.now();
      return res.status(200).json({ ok: true, task_id: mockTask });
    }

    const body = req.body || {};
    const mapVocal = (v) => v === 'male' ? 'm' : v === 'female' ? 'f' : undefined;

    const payload = {
      prompt: body.prompt || body.text || 'melodic pop, catchy chorus',
      style: body.genre || '',
      title: body.title || 'Untitled',
      customMode: true,
      instrumental: !!body.instrumental,
      model: body.model || 'V3_5',
      vocalGender: mapVocal(body.vocalGender),
      negativeTags: '',
      audioLength: body.length || 60
    };

    const r = await fetch(`${SUNO_API_BASE}/generate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SUNO_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      return res.status(r.status).json({ ok: false, error: j.message || 'Suno generate failed' });
    }

    // Pagal dokus – grįžta taskId
    return res.status(200).json({ ok: true, task_id: j.taskId || j.task_id || j.id || null });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'music/create error' });
  }
}
