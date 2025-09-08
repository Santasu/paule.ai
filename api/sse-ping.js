// /api/sse-ping.js
module.exports = async (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let i = 0;
  const timer = setInterval(() => {
    res.write(`event: tick\n`);
    res.write(`data: ${JSON.stringify({ i, at: Date.now() })}\n\n`);
    i++;
    if (i > 50) { // kad neužsilikus process neužtruktų amžinai
      clearInterval(timer);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }, 800);

  req.on('close', () => { clearInterval(timer); try { res.end(); } catch(_){} });
};
