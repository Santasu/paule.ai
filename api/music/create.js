const allow = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
};

module.exports = async (req, res) => {
  allow(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const SUNO_API_KEY  = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers['x-forwarded-host'] || req.headers['host'] || '';
    const base  = (process.env.PUBLIC_URL || process.env.SITE_URL || (host ? `${proto}://${host}` : '')).replace(/\/+$/,'');

    const readBody = () => {
      if (req.method === 'POST') return req.body || {};
      // GET „debug/compat“ – leidžiam paramus per query
      const q = req.query || {};
      return {
        prompt: q.prompt,
        title: q.title,
        style: q.style || q.genre,
        model: q.model,
        instrumental: String(q.instrumental||'').toLowerCase()==='true',
        vocalGender: q.vocalGender,
        negativeTags: q.negativeTags,
        styleWeight: q.styleWeight ? Number(q.styleWeight) : undefined,
        weirdnessConstraint: q.weirdnessConstraint ? Number(q.weirdnessConstraint) : undefined,
        audioWeight: q.audioWeight ? Number(q.audioWeight) : undefined,
        length: q.length ? Number(q.length) : undefined,
        callBackUrl: q.callBackUrl
      };
    };

    const b = readBody();
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

    // jei nėra rakto – grąžinam demo task’ą, kad UI neužstrigtų
    if (!SUNO_API_KEY) return res.status(200).json({ ok:true, task_id:`demo-${Date.now()}`, demo:true });

    const r = await fetch(`${SUNO_API_BASE}/generate`, {
      method:'POST',
      headers:{ 'Authorization':`Bearer ${SUNO_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(()=> ({}));

    if (!r.ok || j.code !== 200) {
      return res.status(200).json({ ok:false, error: j.msg || 'Suno generate failed', raw:j });
    }

    return res.status(200).json({ ok:true, task_id: j.data?.taskId || null });
  } catch (e) {
    return res.status(200).json({ ok:false, error: e?.message || 'music/create error' });
  }
};
