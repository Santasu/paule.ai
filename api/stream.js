// /api/stream.js – SSE vieningu formatu.
// GET /api/stream?model=<backId>&message=...&chat_id=...
// Eventai: start | delta | done | error
export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if ((req.method === 'POST' || req.method === 'GET') && (req.query.mode === 'once')) {
    return onceCompat(req, res);
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }

  const { model='', message='', chat_id='', probe } = req.query;
  const chatId = chat_id || ('chat_'+Date.now()+'_'+Math.random().toString(36).slice(2));

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders && res.flushHeaders();

  const write = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${typeof data==='string'?data:JSON.stringify(data||{})}\n\n`);
  };

  write('start', { model, chat_id: chatId });
  if (String(probe||'') === '1') { write('done', { finish_reason:'probe' }); return res.end(); }

  // TODO: čia prijunk tikrą tiekėją (OpenAI/Anthropic/Google/xAI…)
  const text = demoStreamText(message, model);
  const chunks = simulateChunks(text);

  let i=0;
  const timer = setInterval(()=>{
    if (i >= chunks.length){
      clearInterval(timer);
      write('done', { finish_reason:'stop' });
      return res.end();
    }
    write('delta', { text: chunks[i++] });
  }, 40);

  req.on('close', ()=>{ try{clearInterval(timer);}catch(_){} try{res.end();}catch(_){ } });
}

// Legacy „once“ JSON (suderinamumui su UI)
async function onceCompat(req, res){
  if (req.method==='OPTIONS'){
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }
  let body={};
  if (req.method==='POST'){
    body = await new Promise((resolve,reject)=>{
      let b=''; req.on('data',c=>b+=c); req.on('end',()=>{try{resolve(JSON.parse(b||'{}'))}catch(e){reject(e)}}); });
  }
  const models = String(body.models||req.query.models||'').split(',').map(s=>s.trim()).filter(Boolean);
  const message = body.message || req.query.message || '';
  const chat_id = body.chat_id || ('chat_'+Date.now()+'_'+Math.random().toString(36).slice(2));
  const answers = models.map(m=>({ model:m, text: demoComplete(message,m) }));

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(200).json({ ok:true, chat_id, answers });
}

function demoStreamText(message, model){
  const q = String(message||'').toLowerCase();
  if (q.match(/\b2\s*x\s*2\b/) || q.includes('2x2')) return `(${model}) 4`;
  return `(${model}) ${message||'Sveikas!'}`;
}
function simulateChunks(text){
  const out=[]; const t=String(text||'');
  for (let i=0;i<t.length;i+=Math.max(1, Math.floor(Math.random()*3))){
    out.push(t.slice(i,i+1));
  }
  return out;
}
function demoComplete(message, model){
  const q = String(message||'').toLowerCase();
  let a = '';
  if (q.match(/\b2\s*x\s*2\b/) || q.includes('2x2')) a = '4';
  else a = 'Atsakymas į: ' + message;
  return `(${model}) ${a}`;
}
