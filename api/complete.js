// filename: api/complete.js
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

function isOpenAI(m=''){ return /^gpt-/i.test(m); }
function isAnthropic(m=''){ return /^claude/i.test(m) || /sonnet/i.test(m); }
function isDeepSeek(m=''){ return /deepseek/i.test(m); }
function isXAI(m=''){ return /grok/i.test(m); }
function isGemini(m=''){ return /^(gemini[-\w]*|google\/)/i.test(m); }
function isLlamaFamily(m=''){ return /meta-llama|llama/i.test(m); }
function cleanModelId(m=''){ return String(m).replace(/^openrouter\//i,'').replace(/^together\//i,''); }

async function askOpenAI(model, message, maxTokens){
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${getenv('OPENAI_API_KEY')}` },
    body: JSON.stringify({
      model, stream:false,
      messages:[{role:'user', content:String(message)}],
      max_completion_tokens: maxTokens
    })
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
  return { model, text: j?.choices?.[0]?.message?.content || '' };
}

async function askAnthropic(model, message, maxTokens){
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-api-key': getenv('ANTHROPIC_API_KEY'),
      'anthropic-version':'2023-06-01'
    },
    body: JSON.stringify({
      model, max_tokens: maxTokens,
      messages:[{role:'user', content:String(message)}]
    })
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
  const text = Array.isArray(j?.content) ? (j.content.find(b=>b.type==='text')?.text || '') : (j?.content?.[0]?.text || '');
  return { model, text };
}

async function askDeepSeek(model, message, maxTokens){
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${getenv('DEEPSEEK_API_KEY')}` },
    body: JSON.stringify({
      model, stream:false,
      messages:[{role:'user', content:String(message)}],
      max_tokens: maxTokens
    })
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
  return { model, text: j?.choices?.[0]?.message?.content || '' };
}

async function askGrok(model, message){
  const r = await fetch('https://api.x.ai/v1/chat/completions', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${getenv('XAI_API_KEY')}` },
    body: JSON.stringify({
      model, stream:false,
      messages:[{role:'user', content:String(message)}],
      search_parameters:{ mode:'auto' }
    })
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
  return { model, text: j?.choices?.[0]?.message?.content || '' };
}

async function askGemini(model, message, maxTokens){
  const key = getenv('GOOGLE_API_KEY') || getenv('GEMINI_API_KEY');
  if (!key) return { model, error:'Missing GOOGLE_API_KEY/GEMINI_API_KEY' };
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
  const r = await fetch(endpoint, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({
      contents: [{ role:'user', parts:[{ text:String(message) }]}],
      generationConfig: { maxOutputTokens: maxTokens }
    })
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
  const text = j?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || '';
  return { model, text };
}

async function askOpenRouter(model, message, maxTokens){
  const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization': `Bearer ${getenv('OPENROUTER_API_KEY')}`,
      'HTTP-Referer': getenv('SITE_URL') || 'https://paule.app',
      'X-Title':'Paule'
    },
    body: JSON.stringify({
      model: cleanModelId(model), stream:false,
      messages:[{role:'user', content:String(message)}],
      max_tokens: maxTokens
    })
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
  return { model, text: j?.choices?.[0]?.message?.content || '' };
}

async function askTogether(model, message, maxTokens){
  const r = await fetch('https://api.together.ai/v1/chat/completions', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${getenv('TOGETHER_API_KEY')}` },
    body: JSON.stringify({
      model: cleanModelId(model), stream:false,
      messages:[{role:'user', content:String(message)}],
      max_tokens: maxTokens
    })
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
  return { model, text: j?.choices?.[0]?.message?.content || '' };
}

export default async function handler(req){
  if (req.method && req.method !== 'POST') {
    return new Response(JSON.stringify({ok:false,message:'Method not allowed'}), { status:405, headers:{'Content-Type':'application/json','Access-Control-Allow-Origin':'*'}});
  }
  const body = await req.json().catch(()=>({}));
  const message = body.message || '';
  const models = String(body.models||'').split(',').map(s=>s.trim()).filter(Boolean);
  const maxTokens = Math.max(1, parseInt(body.max_tokens || body.max_completion_tokens || '1024',10));

  const answers = [];
  for (const m of models){
    try{
      if (isOpenAI(m) && HAS.OPENAI){ answers.push(await askOpenAI(m, message, maxTokens)); continue; }
      if (isAnthropic(m) && HAS.ANTHROPIC){ answers.push(await askAnthropic(m, message, maxTokens)); continue; }
      if (isDeepSeek(m) && HAS.DEEPSEEK){ answers.push(await askDeepSeek(m, message, maxTokens)); continue; }
      if (isXAI(m) && HAS.XAI){ answers.push(await askGrok(m, message)); continue; }
      if (isGemini(m) && HAS.GOOGLE){ answers.push(await askGemini(m, message, maxTokens)); continue; }
      if (isLlamaFamily(m)) {
        if (HAS.TOGETHER){ answers.push(await askTogether(m, message, maxTokens)); continue; }
        if (HAS.OPENROUTER){ answers.push(await askOpenRouter(m, message, maxTokens)); continue; }
        answers.push({ model:m, error:'Llama tiekėjui trūksta API rakto' }); continue;
      }
      if (HAS.OPENROUTER){ answers.push(await askOpenRouter(m, message, maxTokens)); continue; }
      answers.push({ model:m, error:'Unsupported model or missing API key' });
    }catch(e){
      answers.push({ model:m, error:String(e?.message || e) });
    }
  }

  return new Response(JSON.stringify({ ok:true, answers }), {
    status: 200,
    headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'Access-Control-Allow-Origin':'*' }
  });
}
