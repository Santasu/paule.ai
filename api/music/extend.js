const allow = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
};
module.exports = async (req, res) => {
  allow(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  const input = req.method==='POST' ? (req.body||{}) : (req.query||{});
  try{
    const SUNO_API_KEY  = process.env.SUNO_API_KEY;
    const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.sunoapi.org/api/v1';
    if (!SUNO_API_KEY) return res.status(200).json({ ok:false, error:'SUNO_API_KEY missing' });

    const payload = {
      defaultParamFlag: String(input.defaultParamFlag||'true').toLowerCase()==='true',
      audioId: input.audioId,
      prompt: input.prompt || '',
      style: input.style || '',
      title: (input.title || '').slice(0,80),
      continueAt: input.continueAt ? Number(input.continueAt) : undefined,
      model: input.model || 'V3_5',
      negativeTags: input.negativeTags || '',
      vocalGender: input.vocalGender==='male'?'m':(input.vocalGender==='female'?'f':undefined),
      styleWeight: input.styleWeight ? Number(input.styleWeight) : undefined,
      weirdnessConstraint: input.weirdnessConstraint ? Number(input.weirdnessConstraint) : undefined,
      audioWeight: input.audioWeight ? Number(input.audioWeight) : undefined,
      callBackUrl: input.callBackUrl
    };

    const r = await fetch(`${SUNO_API_BASE}/generate/extend`, {
      method:'POST', headers:{ 'Authorization':`Bearer ${SUNO_API_KEY}`, 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    const j = await r.json().catch(()=> ({}));
    if (!r.ok || j.code!==200) return res.status(200).json({ ok:false, error:j.msg||'extend failed', raw:j });
    return res.status(200).json({ ok:true, task_id:j.data?.taskId || null });
  }catch(e){ return res.status(200).json({ ok:false, error:String(e?.message||e) }); }
};
