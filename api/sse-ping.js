export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers','Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ ok:false, error:'Method Not Allowed' });

  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('Content-Type','text/event-stream; charset=utf-8');
  res.setHeader('X-Accel-Buffering','no');
  res.flushHeaders && res.flushHeaders();

  const send = (e,d)=>{ res.write(`event: ${e}\n`); res.write(`data: ${JSON.stringify(d)}\n\n`); };

  let i=0;
  const t = setInterval(()=> send('ping', { i:i++, t:Date.now() }), 1000);
  req.on('close', ()=>{ clearInterval(t); try{res.end();}catch(_){ } });
}
