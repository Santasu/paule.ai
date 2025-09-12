const allow = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
};
module.exports = async (req, res) => {
  allow(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  try{
    const SUNO_API_KEY  = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';
    if (!SUNO_API_KEY) return res.status(200).json({ ok:false, error:'SUNO_API_KEY missing' });
    const taskId = String((req.body?.taskId)||'').trim();
    if (!taskId) return res.status(200).json({ ok:false, error:'taskId missing' });

    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host  = req.headers['x-forwarded-host'] || req.headers['host'] || '';
    const base  = (process.env.PUBLIC_URL || process.env.SITE_URL || (host ? `${proto}://${host}` : '')).replace(/\/+$/,'');

    const payload = { taskId, callBackUrl: `${base}/api/music/callback` };
    const r = await fetch(`${SUNO_API_BASE}/suno/cover/generate`, {
      method:'POST', headers:{ 'Authorization':`Bearer ${SUNO_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok || j.code!==200) return res.status(200).json({ ok:false, error:j.msg||'cover-generate failed', raw:j });
    return res.status(200).json({ ok:true, task_id:j.data?.taskId || null });
  }catch(e){ return res.status(200).json({ ok:false, error:String(e?.message||e) }); }
};
