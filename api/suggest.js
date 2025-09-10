export const config = { runtime: 'edge' };

const json = (o, s=200)=> new Response(JSON.stringify(o), {
  status:s, headers:{'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}
});

export default async function handler(req){
  try{
    if (req.method!=='POST') return json({ok:false, suggestions:[]},405);
    const body = await req.json().catch(()=>({}));
    const message = body?.message || '';
    const answer  = body?.answer  || '';
    const prompt = `Sukurk iki 6 trumpų follow-up klausimų, lietuviškai, be numeracijos. 
Vartotojo klausimas: ${message}
Modelio atsakymo ištrauka: ${answer}`;
    try{
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('no key');
      const r = await fetch('https://api.openai.com/v1/chat/completions',{
        method:'POST',
        headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
        body: JSON.stringify({ model:'gpt-4o-mini', stream:false, messages:[{role:'user', content:prompt}] })
      });
      if (!r.ok) throw new Error('http '+r.status);
      const d = await r.json();
      const txt = d?.choices?.[0]?.message?.content || '';
      const suggestions = (txt||'').split(/\n|•|-/).map(s=>s.trim()).filter(Boolean).slice(0,6);
      return json({ok:true, suggestions});
    }catch(_){
      return json({ok:true, suggestions:[
       
      ]});
    }
  }catch(e){
    return json({ok:false, error:String(e||'error'), suggestions:[]}, 200);
  }
}
