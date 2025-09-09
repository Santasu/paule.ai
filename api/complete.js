// /api/complete.js – JSON once (suderinama su Orchestratoriumi)
// Body: { message, models: "a,b,c", chat_id?, max_tokens? }
// Return: { ok:true, chat_id, answers:[{model:<back>, text:<string>}, ...] }
export default async function handler(req, res) {
  // CORS
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }

  try{
    const { message='', models='', chat_id } = await readJson(req);
    const chatId = chat_id || ('chat_'+Date.now()+'_'+Math.random().toString(36).slice(2));
    const list = String(models||'').split(',').map(s=>s.trim()).filter(Boolean);

    // ČIA integruok į tikrus tiekėjus (Claude/Gemini/Grok ir pan.)
    // Dabar – demo echo su „semantiniu“ atsakymu:
    const answers = list.map(m=>{
      const txt = demoComplete(message, m);
      return { model:m, text:txt };
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok:true, chat_id:chatId, answers });
  }catch(e){
    return res.status(400).json({ ok:false, error:String(e.message||e) });
  }
}

function readJson(req){
  return new Promise((resolve,reject)=>{
    let b=''; req.on('data',ch=> b+=ch); req.on('end', ()=>{ try{ resolve(JSON.parse(b||'{}')); }catch(e){ reject(e); } });
  });
}

function demoComplete(message, model){
  // paprastas pseudo-atsakymas: 2x2 -> 4 ir pan.
  const q = String(message||'').toLowerCase();
  let a = '';
  if (q.match(/\b2\s*x\s*2\b/) || q.includes('2x2')) a = '4';
  else a = 'Atsakymas į: ' + message;
  return `(${model}) ${a}`;
}
