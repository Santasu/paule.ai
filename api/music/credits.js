module.exports = async (_req, res) => {
  try {
    const SUNO_API_KEY  = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';
    if (!SUNO_API_KEY) return res.status(200).json({ ok:false, error:'SUNO_API_KEY missing' });

    async function tryGet(path){
      const r = await fetch(`${SUNO_API_BASE}${path}`, { headers:{ 'Authorization':`Bearer ${SUNO_API_KEY}` } });
      const j = await r.json().catch(()=> ({}));
      return { ok: r.ok && j.code===200, body:j, status:r.status };
    }

    let t = await tryGet('/get-credits');
    if (!t.ok) t = await tryGet('/credits');

    if (!t.ok) return res.status(200).json({ ok:true, credits:null, note:'credits endpoint not available', raw:t.body, http:t.status });

    const credits = t.body?.data?.credits ?? t.body?.data ?? null;
    return res.status(200).json({ ok:true, credits });
  } catch (e) { return res.status(200).json({ ok:false, error:String(e?.message||e) }); }
};
