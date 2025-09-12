module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'METHOD_NOT_ALLOWED' });

    const SUNO_API_KEY  = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers['x-forwarded-host'] || req.headers['host'] || '';
    const base  = (process.env.PUBLIC_URL || process.env.SITE_URL || (host ? `${proto}://${host}` : '')).replace(/\/+$/,'');

    const b = req.body || {};
    const mapVocal = v => v==='male' ? 'm' : v==='female' ? 'f' : undefined;
    const customMode = b.customMode ?? !!(b.title || b.style || b.genre);

    const payload = {
      prompt: b.prompt || b.text || 'A peaceful acoustic guitar melody with soft vocals, folk style',
      customMode,
      instrumental: !!b.instrumental,
      model: b.model || 'V3_5',
      style: b.style || b.genre || '',
      title: (b.title || 'Untitled').slice(0,80),
      vocalGender: mapVocal(b.vocalGender),
      negativeTags: b.negativeTags || '',
      styleWeight: isFinite(b.styleWeight) ? Number(b.styleWeight) : undefined,
      weirdnessConstraint: isFinite(b.weirdnessConstraint) ? Number(b.weirdnessConstraint) : undefined,
      audioWeight: isFinite(b.audioWeight) ? Number(b.audioWeight) : undefined,
      audioLength: isFinite(b.length) ? Number(b.length) : undefined,
      callBackUrl: b.callBackUrl || (base ? `${base}/api/music/callback` : undefined)
    };

    if (!SUNO_API_KEY) return res.status(200).json({ ok:true, task_id:`demo-${Date.now()}`, demo:true });

    const r = await fetch(`${SUNO_API_BASE}/generate`, {
      method:'POST',
      headers:{ 'Authorization':`Bearer ${SUNO_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(()=> ({}));

    if (!r.ok || j.code !== 200) {
      return res.status(r.ok ? 200 : r.status).json({ ok:false, error: j.msg || 'Suno generate failed', raw:j });
    }

    return res.status(200).json({ ok:true, task_id: j.data?.taskId || null });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'music/create error' });
  }
};
