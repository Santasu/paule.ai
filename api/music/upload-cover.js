const allow = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
};
module.exports = async (req, res) => {
  allow(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const b = req.method==='POST' ? (req.body||{}) : (req.query||{});
  try{
    const SUNO_API_KEY  = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';
    if (!SUNO_API_KEY) return res.status(200).json({ ok:false, error:'SUNO_API_KEY missing' });

    const payload = {
      uploadUrl: b.uploadUrl || '',
      prompt: b.prompt || '',
      style: b.style || '',
      title: (b.title||'').slice(0,80),
      customMode: String(b.customMode||'true').toLowerCase()==='true',
      instrumental: String(b.instrumental||'false').toLowerCase()==='true',
      model: b.model || 'V3_5',
      negativeTags: b.negativeTags || '',
      vocalGender: b.vocalGender==='male'?'m':(b.vocalGender==='female'?'f':undefined),
      styleWeight: b.styleWeight ? Number(b.styleWeight) : undefined,
      weirdnessConstraint: b.weirdnessConstraint ? Number(b.weirdnessConstraint) : undefined,
      audioWeight: b.audioWeight ? Number(b.audioWeight) : undefined,
      callBackUrl: b.callBackUrl
    };

    const r = await fetch(`${SUNO_API_BASE}/generate/upload-cover`, {
      method:'POST', headers:{ 'Authorization':`Bearer ${SUNO_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok || j.code!==200) return res.status(200).json({ ok:false, error:j.msg||'upload-cover failed', raw:j });
    return res.status(200).json({ ok:true, task_id:j.data?.taskId || null });
  }catch(e){ return res.status(200).json({ ok:false, error:String(e?.message||e) }); }
};
