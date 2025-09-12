module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'METHOD_NOT_ALLOWED' });
    const SUNO_API_KEY  = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';
    const PUBLIC_URL    = process.env.PUBLIC_URL || process.env.SITE_URL || '';
    if (!SUNO_API_KEY) return res.status(200).json({ ok:false, error:'SUNO_API_KEY missing' });

    const body = Object.assign({},
      req.body || {},
      { callBackUrl: (req.body && req.body.callBackUrl) || (PUBLIC_URL ? `${PUBLIC_URL.replace(/\/+$/,'')}/api/music/callback` : undefined) }
    );

    const r = await fetch(`${SUNO_API_BASE}/generate/extend`, {
      method:'POST',
      headers:{ 'Authorization':`Bearer ${SUNO_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok || j.code !== 200) return res.status(200).json({ ok:false, error: j.msg || 'extend failed', raw:j });
    return res.status(200).json({ ok:true, task_id: j.data?.taskId || null });
  } catch (e) { return res.status(500).json({ ok:false, error:String(e?.message||e) }); }
};
