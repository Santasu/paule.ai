// GET -> SSE; POST -> once JSON. Čia ECHO stubas, kad galėtum patikrinti UI.

function sse(res) {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
}

function sendEvent(res, type, payload) {
  if (type) res.write(`event: ${type}\n`);
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

module.exports = async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const mode = (url.searchParams.get('mode') || req.body?.mode || '').toLowerCase();

  if (req.method === 'GET' && mode !== 'once') {
    // SSE
    sse(res);
    const chat_id = `chat_${Date.now()}`;
    const message = url.searchParams.get('message') || 'Sveikas, Paule!';
    const model = url.searchParams.get('models') || 'auto';

    sendEvent(res, 'start', { chat_id });
    sendEvent(res, 'model_init', { model, panel: model, chat_id });

    let i = 0;
    const parts = [`Atsakymas apie: "${message}"`, " – viskas veikia ✅"];
    const t = setInterval(() => {
      if (i < parts.length) {
        sendEvent(res, 'delta', { model, panel: model, text: parts[i] });
        i++;
      } else {
        clearInterval(t);
        sendEvent(res, 'answer', { model, panel: model, text: parts.join('') });
        sendEvent(res, 'model_done', { model, panel: model });
        sendEvent(res, 'done', { ok: true, chat_id });
        res.end();
      }
    }, 350);
    return;
  }

  // POST mode=once
  try {
    const body = typeof req.body === 'object' ? req.body : JSON.parse(req.body || '{}');
    const txt = body.message || 'No message';
    const model = body.models || body.model || 'auto';
    res.setHeader('Content-Type', 'application/json');
    res.status(200).end(JSON.stringify({
      ok: true,
      chat_id: `chat_${Date.now()}`,
      answers: [{ model, text: `Atsakymas (once): ${txt}` }]
    }));
  } catch (e) {
    res.status(400).end(JSON.stringify({ ok:false, error: e.message }));
  }
};

