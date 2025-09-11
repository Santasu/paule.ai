// /api/complete.js
import { okJSON } from './_utils.js';

export default async function handler(req, res) {
  try{
    if (req.method !== 'POST') {
      res.status(405).json({ ok:false, message:'Method not allowed' }); return;
    }
    const { message='', models='', max_tokens=1024 } = req.body || {};
    const list = String(models||'').split(',').map(s=>s.trim()).filter(Boolean);

    async function askAnthropic(model){
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY || '',
          'anthropic-version':'2023-06-01'
        },
        body: JSON.stringify({
          model, max_tokens: Number(max_tokens)||1024,
          messages:[{ role:'user', content:String(message||'') }]
        })
      });
      const j = await r.json().catch(()=>null);
      if (!r.ok) return { model, error: (j?.error?.message||`HTTP ${r.status}`) };
      const text = Array.isArray(j?.content) ? (j.content.find(b=>b.type==='text')?.text || '') : (j?.content?.[0]?.text || '');
      return { model, text };
    }

    async function askXAI(model){
      const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':`Bearer ${process.env.XAI_API_KEY || ''}`
        },
        body: JSON.stringify({
          model, stream:false,
          messages:[{ role:'user', content:String(message||'') }]
        })
      });
      const j = await r.json().catch(()=>null);
      if (!r.ok) return { model, error: (j?.error?.message||`HTTP ${r.status}`) };
      const text = j?.choices?.[0]?.message?.content || '';
      return { model, text };
    }

    const answers = [];
    for (const m of list){
      if (/^claude|sonnet/i.test(m)) {
        answers.push(await askAnthropic(m));
      } else if (/grok/i.test(m)) {
        answers.push(await askXAI(m));
      } else {
        // Paliekam vietą kitiems tiekėjams arba tiesiog grąžinam „neįgyvendinta“
        answers.push({ model:m, error:'not_implemented' });
      }
    }

    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.status(200).send(JSON.stringify({ ok:true, answers }));
  }catch(err){
    res.status(500).json({ ok:false, message:String(err?.message||err) });
  }
}
