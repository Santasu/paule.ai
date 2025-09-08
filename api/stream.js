// /api/stream.js  (Vercel, Node)
module.exports = async (req, res) => {
  // CORS ir preflight (jei prireiks)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.statusCode = 204;
    return res.end();
  }
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Parametrai
  const url = new URL(req.url, 'http://localhost');
  const q   = Object.fromEntries(url.searchParams.entries());
  const body = (req.method === 'POST' && req.headers['content-type']?.includes('application/json'))
    ? await new Promise(r => { let s=''; req.on('data',c=>s+=c); req.on('end',()=>{ try{r(JSON.parse(s||'{}'))}catch(_){r({})} }); })
    : {};

  const mode   = String(q.mode || body.mode || '').toLowerCase();
  const msg    = String(body.message || q.message || 'Labas!');
  const models = String(body.models || q.models || '').split(',').map(s=>s.trim()).filter(Boolean);
  const chatId = String(q.chat_id || body.chat_id || ('chat_'+Date.now()));

  // ---- JSON atsakymas (mode=once) ----
  if (mode === 'once') {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');

    const list = models.length ? models : ['auto'];
    const answers = list.map(m => ({
      model: m,
      text: `(${m}) JSON once atsakymas: „${msg}“`
    }));

    return res.end(JSON.stringify({ ok: true, chat_id: chatId, answers }));
  }

  // ---- SSE stream (numatytoji šaka) ----
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  // start event (pasigauna UI, jei siunčiam)
  res.write(`event: start\ndata: ${JSON.stringify({ chat_id: chatId })}\n\n`);

  const chunks = [
    `Pradžia: ${msg}`,
    '…dirbam…',
    '…testuojam SSE…',
    'Baigta.'
  ];
  let i = 0;
  const timer = setInterval(() => {
    const t = chunks[i++];
    if (t) {
      res.write(`data: ${JSON.stringify({ choices:[{ delta:{ role:'assistant', content: t } }] })}\n\n`);
    } else {
      clearInterval(timer);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }, 450);

  req.on('close', () => { clearInterval(timer); try{ res.end(); } catch(_){} });
};
