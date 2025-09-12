const allow = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
};

module.exports = async (req, res) => {
  allow(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  const readInput = () => {
    if (req.method === 'POST') return req.body || {};
    const q = req.query || {};
    return {
      title: q.title, prompt: q.prompt || q.text, model: q.model,
      style: q.style || q.genre,
      instrumental: String(q.instrumental||'').toLowerCase()==='true',
      vocalGender: q.vocalGender, language: q.language
    };
  };

  try{
    const SUNO_API_KEY  = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers['x-forwarded-host'] || req.headers['host'] || '';
    const base  = (process.env.PUBLIC_URL || process.env.SITE_URL || (host ? `${proto}://${host}` : '')).replace(/\/+$/,'');

    const b = readInput();
    const mapVocal = v => v==='male' ? 'm' : v==='female' ? 'f' : undefined;
    const customMode = !!(b.title || b.style);

    const payload = {
      prompt: b.prompt || 'A peaceful acoustic guitar melody with soft vocals, folk style',
      customMode,
      instrumental: !!b.instrumental,
      model: b.model || 'V3_5',
      style: b.style || '',
      title: (b.title || 'Untitled').slice(0,80),
      vocalGender: mapVocal(b.vocalGender),
      callBackUrl: `${base}/api/music/callback`
    };

    if (!SUNO_API_KEY) {
      return res.status(200).json({ ok:true, task_id:`demo-${Date.now()}`, demo:true });
    }

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
  }catch(e){
    return res.status(200).json({ ok:false, error: e?.message || 'music/create error' });
  }
};
