module.exports = async (req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  let i = 0;
  const t = setInterval(() => {
    res.write(`event: tick\n`);
    res.write(`data: ${JSON.stringify({ i, at: Date.now() })}\n\n`);
    if (++i > 50) { clearInterval(t); res.write('data: [DONE]\n\n'); res.end(); }
  }, 800);

  req.on('close', () => { clearInterval(t); try { res.end(); } catch(_){} });
};
