// filename: api/diagnostics.js
export const config = { runtime: 'edge' };

function getenv(k){ return (process.env[k] || '').trim(); }
const HAS = {
  OPENAI: !!getenv('OPENAI_API_KEY'),
  ANTHROPIC: !!getenv('ANTHROPIC_API_KEY'),
  GOOGLE: !!(getenv('GOOGLE_API_KEY') || getenv('GEMINI_API_KEY')),
  XAI: !!getenv('XAI_API_KEY'),
  DEEPSEEK: !!getenv('DEEPSEEK_API_KEY'),
  OPENROUTER: !!getenv('OPENROUTER_API_KEY'),
  TOGETHER: !!getenv('TOGETHER_API_KEY')
};

async function tryFetch(name, fn){
  const started = Date.now();
  try{
    await fn();
    return { name, ok:true, ms: Date.now()-started };
  }catch(e){
    return { name, ok:false, ms: Date.now()-started, error: String(e?.message || e) };
  }
}

export default async function handler(req){
  const q = new URL(req.url).searchParams.get('q') || 'labas';
  const out = { keys: HAS, checks: [] };

  // OpenAI (non-stream, 1 token)
  if (HAS.OPENAI) out.checks.push(await tryFetch('openai', async ()=>{
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${getenv('OPENAI_API_KEY')}` },
      body: JSON.stringify({ model:'gpt-5-mini', messages:[{role:'user', content:q}], max_completion_tokens: 8, stream:false })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
  }));

  // Anthropic (non-stream, 1–8 tokenų)
  if (HAS.ANTHROPIC) out.checks.push(await tryFetch('anthropic', async ()=>{
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'x-api-key': getenv('ANTHROPIC_API_KEY'), 'anthropic-version':'2023-06-01' },
      body: JSON.stringify({ model:'claude-3-5-sonnet-20241022', messages:[{role:'user', content:q}], max_tokens: 8 })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
  }));

  // Gemini
  if (HAS.GOOGLE) out.checks.push(await tryFetch('gemini', async ()=>{
    const key = getenv('GOOGLE_API_KEY') || getenv('GEMINI_API_KEY');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`;
    const r = await fetch(endpoint, {
      method:'POST',
      headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ contents:[{ role:'user', parts:[{ text:q }]}], generationConfig:{ maxOutputTokens: 8 } })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
  }));

  // Grok
  if (HAS.XAI) out.checks.push(await tryFetch('grok', async ()=>{
    const r = await fetch('https://api.x.ai/v1/chat/completions', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${getenv('XAI_API_KEY')}` },
      body: JSON.stringify({ model:'grok-4', messages:[{role:'user', content:q}], stream:false })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
  }));

  // DeepSeek
  if (HAS.DEEPSEEK) out.checks.push(await tryFetch('deepseek', async ()=>{
    const r = await fetch('https://api.deepseek.com/chat/completions', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${getenv('DEEPSEEK_API_KEY')}` },
      body: JSON.stringify({ model:'deepseek-chat', messages:[{role:'user', content:q}], max_tokens:8, stream:false })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
  }));

  // Together/OpenRouter (Llama)
  if (HAS.TOGETHER) out.checks.push(await tryFetch('together', async ()=>{
    const r = await fetch('https://api.together.ai/v1/chat/completions', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${getenv('TOGETHER_API_KEY')}` },
      body: JSON.stringify({ model:'meta-llama/Llama-4-Scout-17B-16E-Instruct', messages:[{role:'user', content:q}], max_tokens:8, stream:false })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
  }));
  if (HAS.OPENROUTER) out.checks.push(await tryFetch('openrouter', async ()=>{
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${getenv('OPENROUTER_API_KEY')}`, 'HTTP-Referer': getenv('SITE_URL') || 'https://paule.app', 'X-Title':'Paule' },
      body: JSON.stringify({ model:'meta-llama/Llama-4-Scout-17B-16E-Instruct', messages:[{role:'user', content:q}], max_tokens:8, stream:false })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0,200)}`);
  }));

  return new Response(JSON.stringify({ ok:true, ...out }, null, 2), {
    headers:{ 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*' }
  });
}
