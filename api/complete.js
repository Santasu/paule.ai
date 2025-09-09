// JSON once endpoint, naudojamas ne-SSE modeliams
export default async function handler(req, res) {
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

    // TODO: čia sujunk su tikrais tiekėjais
    const answers = list.map(m=>({ model:m, text: demoComplete(message, m) }));

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
  const q = String(message||'').toLowerCase();
  if (q.match(/\b2\s*x\s*2\b/) || q.includes('2x2')) return `(${model}) 4`;
  return `(${model}) Atsakymas į: ${message}`;
}
