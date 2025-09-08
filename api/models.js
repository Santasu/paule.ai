// /api/models.js – Vercel serverless (Node • CommonJS)
// Grąžina modelių sąrašą ir capabilities, kad UI galėtų rodyti mygtukus.

module.exports = async (req, res) => {
  // CORS / preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(405).json({ ok:false, error:'Method Not Allowed' });
  }

  const iconsBase = '/assets/icon';

  const frontToBack = {
    'auto':'auto','paule':'auto','augam-auto':'auto',
    'chatgpt':'gpt-4o-mini',
    'claude':'claude-4-sonnet',
    'gemini':'gemini-2.5-flash',
    'grok':'grok-4',
    'deepseek':'deepseek-chat',
    'llama':'meta-llama/Llama-4-Scout-17B-16E-Instruct',
  };

  const friendly = {
    'auto':'Paule','paule':'Paule','augam-auto':'Paule',
    'chatgpt':'ChatGPT','claude':'Claude','gemini':'Gemini',
    'grok':'Grok','deepseek':'DeepSeek','llama':'Llama'
  };

  const icon = {
    'auto':`${iconsBase}/ai.svg`,
    'chatgpt':`${iconsBase}/chatgpt.svg`,
    'claude':`${iconsBase}/claude-seeklogo.svg`,
    'gemini':`${iconsBase}/gemini.svg`,
    'grok':`${iconsBase}/xAI.svg`,
    'deepseek':`${iconsBase}/deepseek.svg`,
    'llama':`${iconsBase}/llama.svg`,
  };

  // Tie, kurių NEstreaminam per SSE
  const nonSSE = new Set(['claude','grok','gemini']);

  const items = Object.keys(frontToBack)
    .filter(k => k!=='paule' && k!=='augam-auto') // aliasų nerodom
    .map(k => ({
      id: k,
      back: frontToBack[k],
      name: friendly[k] || k,
      icon: icon[k] || icon['auto'],
      sse: !nonSSE.has(k)
    }));

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).end(JSON.stringify({
    ok: true,
    items,
    front_to_back: frontToBack,
    non_sse: Array.from(nonSSE)
  }));
};
