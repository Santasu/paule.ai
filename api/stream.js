module.exports = async (req, res) => {
  const msg = (req.method === 'POST' && req.body?.message) || req.query.message || 'Labas!';
  res.statusCode = 200;
  res.setHeader('Content-Type','text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('Connection','keep-alive');
  res.setHeader('X-Accel-Buffering','no');
  res.flushHeaders?.();

  const chunks = [`Pradžia: ${msg}`, '…dirbam…', '…be tiekėjų…', 'Baigiam.'];
  let i = 0;
  const timer = setInterval(() => {
    const t = chunks[i++];
    if (t) {
      res.write(`data: ${JSON.stringify({ choices:[{ delta:{ role:'assistant', content:t } }] })}\n\n`);
    } else {
      clearInterval(timer);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }, 700);

  req.on('close', () => { clearInterval(timer); try { res.end(); } catch(_){} });
};
