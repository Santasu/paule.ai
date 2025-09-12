module.exports = async (_req, res) => {
  try {
    const SUNO_API_KEY  = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';
    if (!SUNO_API_KEY) return res.status(200).json({ ok:false, error:'SUNO_API_KEY missing' });

    async function tryPath(path){
      const r = await fetch(`${SUNO_API_BASE}${path}`, { headers:{ 'Authorization':`Bearer ${SUNO_API_KEY}` } });
      const j = await r.json().catch(()=> ({}));
      return { ok:r.ok && j.code===200, j };
    }

    let ans = await tryPath('/get-credits');
    if (!ans.ok) ans = await tryPath('/credits');

    if (!ans.ok) return res.status(200).json({ ok:false, error:'credits failed', raw: ans.j || null });

    return res.status(200).json({ ok:true, credits: ans.j?.data?.credits ?? null });
  } catch (e) { return res.status(500).json({ ok:false, error:String(e?.message||e) }); }
};
