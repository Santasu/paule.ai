// api/suggest.js
const { jsonOK, jsonERR } = require('../_utils');
const { getEnv } = require('../_auth');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.end(); return;
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST'); return res.status(405).end('Method Not Allowed');
  }

  try {
    const { message = '', answer = '', count = 6 } = await readBody(req);
    const env = getEnv();
    let suggestions = [];

    if (env.OPENAI) {
      try {
        const prompt = `Sukurti ${count} trumpos formos (iki 5 žodžių) gerus tolesnius klausimus vartotojui, remiantis jo užklausa ir atsakymu.\nUžklausa:\n${message}\n\nAtsakymas:\n${answer}\n\nGrąžink JSON masyvą stringų be jokio paaiškinimo.`;
        const r = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.OPENAI}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            stream: false,
            temperature: 0.3,
            messages: [{ role: 'user', content: prompt }]
          })
        });
        if (r.ok) {
          const j = await r.json();
          const txt = j?.choices?.[0]?.message?.content || '[]';
          try { suggestions = JSON.parse(txt); } catch { suggestions = []; }
        }
      } catch {}
    }

    if (!Array.isArray(suggestions) || !suggestions.length) {
      suggestions = [
        'Paaiškink detaliau',
        'Duok pavyzdį',
        'Sukurk veiksmų planą',
        'Kokie pavojai?',
        'Kokie KPI?',
        'Alternatyvus sprendimas'
      ];
    }

    return jsonOK(res, { ok: true, suggestions });
  } catch (e) {
    return jsonERR(res, { ok: false, error: { message: e.message || 'Server error' } }, 500);
  }
};

async function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', ch => data += ch);
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
