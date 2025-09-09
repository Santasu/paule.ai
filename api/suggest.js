// Siūlo 3–5 trumputes (3–7 žodžių) „follow-up“ žinutes
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
    const { message='', answer='', count=5 } = await readJson(req);
    const n = Math.max(3, Math.min(7, Number(count)||5));
    const base = seedFrom(message, answer);
    const suggestions = synthesizeShort(base, n);

    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Cache-Control','no-store');
    return res.status(200).json({ ok:true, suggestions });
  }catch(e){
    return res.status(400).json({ ok:false, error:String(e.message||e) });
  }
}

function readJson(req){
  return new Promise((resolve,reject)=>{
    let b=''; req.on('data',ch=> b+=ch); req.on('end', ()=>{ try{ resolve(JSON.parse(b||'{}')); }catch(e){ reject(e); } });
  });
}
function seedFrom(msg, ans){
  const s = (String(msg)+' '+String(ans)).toLowerCase().replace(/[^a-ząčęėįšųūž0-9\s]/gi,' ');
  return s.split(/\s+/).filter(Boolean).slice(0, 20);
}
function synthesizeShort(words, n){
  const stock = ['Paaiškink detaliau','Duok pavyzdį','Sukurk veiksmų planą','Kokie pavojai?','Kokie KPI?','Alternatyvus sprendimas','Sutrumpink iki 3 sakinių','Išversk į anglų','Ką daryti toliau?'];
  const out = [];
  for (let i=0;i<n;i++){
    if (i < stock.length) out.push(stock[i]);
    else {
      const len = 3 + Math.floor(Math.random()*5);
      const parts = Array.from({length:len}, ()=> words[Math.floor(Math.random()*Math.max(1,words.length))] || 'daugiau');
      out.push(capitalize(parts.join(' ')));
    }
  }
  return Array.from(new Set(out)).slice(0,n);
}
function capitalize(s){ return s.charAt(0).toUpperCase()+s.slice(1); }
