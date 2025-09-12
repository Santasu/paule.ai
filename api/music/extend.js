module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method Not Allowed' });
    const SUNO_API_KEY  = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';
    if (!SUNO_API_KEY) return res.status(200).json({ ok:false, error:'SUNO_API_KEY missing' });

    const r = await fetch(`${SUNO_API_BASE}/generate/extend`, {
      method:'POST',
      headers:{ 'Authorization':`Bearer ${SUNO_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify(req.body || {})
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok || j.code !== 200) return res.status(200).json({ ok:false, error: j.msg || 'extend failed', raw:j });
    return res.status(200).json({ ok:true, task_id: j.data?.taskId || null });
  } catch (e) { return res.status(500).json({ ok:false, error:String(e?.message||e) }); }
};
