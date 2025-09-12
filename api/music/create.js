// Vercel Serverless (Node 18+): /api/music/create
// Paleidžia Suno generaciją ir grąžina task_id. Jei nėra rakto – grąžina demo task_id.
module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.status(405).json({ ok: false, error: 'Method Not Allowed' });
      return;
    }

    const SUNO_API_KEY  = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';

    const body = req.body || {};
    const mapVocal = (v) => v === 'male' ? 'm' : v === 'female' ? 'f' : undefined;

    const payload = {
      prompt:        body.prompt || body.text || 'melodic pop, catchy chorus',
      style:         body.genre || '',
      title:         body.title || 'Untitled',
      customMode:    true,
      instrumental:  !!body.instrumental,
      model:         body.model || 'V3_5',
      vocalGender:   mapVocal(body.vocalGender),
      negativeTags:  '',
      audioLength:   body.length || 60
    };

    // Demo be rakto – leidžiam UI’ui gyventi
    if (!SUNO_API_KEY) {
      const mockTask = 'demo-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      res.status(200).json({ ok: true, task_id: mockTask });
      return;
    }

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
      res.status(r.status).json({ ok: false, error: j.message || 'Suno generate failed' });
      return;
    }

    res.status(200).json({ ok: true, task_id: j.taskId || j.task_id || j.id || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: e?.message || 'music/create error' });
  }
};
