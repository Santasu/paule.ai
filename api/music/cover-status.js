module.exports = async (_req, res) => {
  try {
    const SUNO_API_KEY  = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';
    if (!SUNO_API_KEY) return res.status(200).json({ ok:false, error:'SUNO_API_KEY missing' });

    const r = await fetch(`${SUNO_API_BASE}/suno/cover/record-info`, { headers:{ 'Authorization':`Bearer ${SUNO_API_KEY}` } });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok || j.code !== 200) return res.status(200).json({ ok:false, error: j.msg || 'cover-status failed', raw:j });

    const images = j?.data?.response?.images || [];
    return res.status(200).json({ ok:true, images });
  } catch (e) { return res.status(500).json({ ok:false, error:String(e?.message||e) }); }
};
