// api/stream.js
const { ENV } = require('./_utils/env');

module.exports = async (req, res) => {
  res.setHeader('Content-Type','text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control','no-cache, no-transform');
  res.setHeader('Connection','keep-alive');

  const url = new URL(req.url, 'http://localhost');
  const message = (url.searchParams.get('message') || 'Labas').slice(0, 2000);
  const model = (url.searchParams.get('model') || url.searchParams.get('models') || 'paule-ai');

  const chat_id = 'chat_' + Date.now();
  const send = (event, data) => res.write(`event: ${event}\n` + `data: ${JSON.stringify(data)}\n\n`);

  send('start', { chat_id });
  send('model_init', { model, panel:'auto', chat_id });

  try {
    let text = '';

    // „Paule AI“ = Together Llama, jei turim raktą; kitaip – lokalus bandomasis ats.
    if (ENV.TOGETHER && (model === 'paule-ai' || model === 'auto' || model.includes('llama'))) {
      const togetherModel = 'meta-llama/Llama-3.3-70B-Instruct-Turbo'; // greitas/pigus default
      const r = await fetch('https://api.together.xyz/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.TOGETHER_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: togetherModel,
          messages: [
            { role:'system', content:'Tu esi „Paule AI“ (Lietuvoje sukurtas, 2025-05-02). Atsakinėk trumpai ir aiškiai.' },
            { role:'user', content: message }
          ],
          temperature: 0.7,
          max_tokens: 400
        })
      });
      const j = await r.json();
      text = j?.choices?.[0]?.message?.content || '';
      if (!text) throw new Error('Together API grąžino tuščią atsakymą');
    } else {
      text = `Atsakymas apie: "${message}" – viskas veikia ✅`;
    }

    // „Srautink“ keliais gabaliukais
    for (const part of (text.match(/.{1,120}/g) || [text])) {
      send('delta', { model, panel:'auto', text: part });
    }
    send('answer', { model, panel:'auto', text });
    send('model_done', { model, panel:'auto' });
    send('done', { ok:true, chat_id });
    res.end();
  } catch (e) {
    send('error', { ok:false, error: e.message });
    res.end();
  }
};
