const BFL_API = process.env.BFL_API || 'https://api.bfl.ai/v1';
const BFL_KEY = process.env.BFL_API_KEY;

async function wait(ms){ return new Promise(r => setTimeout(r, ms)); }

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ ok:false, error:'Method Not Allowed' });
    if (!BFL_KEY) return res.status(200).json({ ok:false, error:'Set BFL_API_KEY in Vercel' });

    const { prompt = 'cinematic portrait, soft light', width, height, aspect_ratio, model } = req.body || {};

    // Paprastas pasirinkimas – FLUX 1.1 pro
    const endpoint = `${BFL_API}/${model || 'flux-pro-1.1'}`;
    const body = {
      prompt,
      ...(aspect_ratio ? { aspect_ratio } : { aspect_ratio: '1:1' }),
      ...(width && height ? { width, height } : {})
    };

    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'x-key': BFL_KEY, 'accept': 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(r.status).json({ ok:false, error: j.message || 'BFL create failed' });

    const pollingUrl = j.polling_url;
    if (!pollingUrl) return res.status(200).json({ ok:false, error:'No polling_url' });

    // Poll iki ~9s (Vercel default timeout saugiai)
    let out = null, status = 'Pending';
    for (let i = 0; i < 16; i++) {
      await wait(600);
      const pr = await fetch(pollingUrl, { headers: { 'x-key': BFL_KEY, 'accept': 'application/json' } });
      const pj = await pr.json().catch(() => ({}));
      status = pj.status || status;
      if (status === 'Ready' && pj?.result?.sample) { out = pj.result.sample; break; }
      if (status === 'Error' || status === 'Failed') break;
    }

    if (!out) return res.status(200).json({ ok:false, status, error:'Timeout or not ready' });

    return res.status(200).json({ ok:true, image_url: out });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e?.message || 'flux/create error' });
  }
}
