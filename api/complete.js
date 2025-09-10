// /api/complete.js
export const config = { runtime: 'edge' };

const okJSON = (obj, status=200) =>
  new Response(JSON.stringify(obj), { status, headers: {
    'Content-Type':'application/json',
    'Cache-Control':'no-store',
    'Access-Control-Allow-Origin':'*'
  }});

// „žmoniški“ ID -> tikri tiekėjų model ID
const ALIAS = Object.freeze({
  'claude-4-sonnet': 'claude-3.5-sonnet-latest', // veikiantis Claude Sonnet aliasas
  'grok-4':          'grok-2-latest',            // xAI Grok aliasas
  // Paliekam gemini tokį pat, bet jei 404 – fallback žemiau
});

export default async function handler(req) {
  try{
    const { message='', models='', chat_id=null, max_tokens=1024 } = await req.json();
    const backIds = String(models||'').split(',').map(s=>s.trim()).filter(Boolean);

    const tasks = backIds.map(async (raw) => {
      const model = ALIAS[raw] || raw;
      try{
        if (model.startsWith('claude'))   return await runClaude(model, message, max_tokens);
        if (model.startsWith('gemini'))   return await runGemini(model, message, max_tokens);
        if (model.startsWith('grok'))     return await runGrok(model, message, max_tokens);
        return { model: raw, text:'', error:'Šis modelis numatytas SSE srautui (naudok /api/stream).' };
      }catch(e){
        return { model: raw, text:'', error:(e && e.message) || String(e) };
      }
    });

    const results = await Promise.all(tasks);
    const answers = results.map(r => ({ model:r.model, text:r.text||'', error:r.error||'' }));
    const errors  = results.filter(r => r.error).map(r => ({ front:r.model, error:r.error }));

    return okJSON({ ok:true, chat_id: chat_id || null, answers, errors });
  }catch(e){
    return okJSON({ ok:false, answers:[], errors:[{ error:(e && e.message) || 'Server error' }] }, 500);
  }
}

// === Driveriai ===

async function runClaude(model, prompt, max_tokens){
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { model, text:'', error:'Trūksta ANTHROPIC_API_KEY' };

  const body = {
    model,
    max_tokens: Math.min(1024, max_tokens||512),
    messages: [{ role:'user', content: prompt }]
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'content-type':'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!res.ok){
    let err = 'Anthropic HTTP '+res.status;
    try{ const j=await res.json(); if (j?.error?.message) err=j.error.message; }catch(_){}
    return { model, text:'', error: err };
  }

  const data = await res.json();
  // data.content = [{type:'text', text:'...'}]
  const text = Array.isArray(data?.content)
    ? data.content.map(p=>p?.text||'').join('')
    : (data?.output_text || '');
  return { model, text:(text||'').trim(), error:'' };
}

async function runGemini(model, prompt, max_tokens){
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return { model, text:'', error:'Trūksta GOOGLE_API_KEY' };

  let useModel = model;
  const url = (m)=>`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent?key=${key}`;
  const body = {
    contents: [{ role:'user', parts:[{ text: prompt }]}],
    generationConfig: { maxOutputTokens: Math.min(1024, max_tokens||512) }
  };

  // Pirma – bandome su pateiktu modeliu
  let res = await fetch(url(useModel), { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });

  // Jei 404/400 – bandome su safe fallback
  if (!res.ok && res.status >= 400 && res.status < 500 && useModel !== 'gemini-1.5-flash') {
    useModel = 'gemini-1.5-flash';
    res = await fetch(url(useModel), { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
  }

  if (!res.ok){
    let err='Gemini HTTP '+res.status;
    try{ const j=await res.json(); if (j?.error?.message) err=j.error.message; }catch(_){}
    return { model, text:'', error: err };
  }

  const data = await res.json();
  // Įvairūs „variantai“ per laiką
  const cand  = data?.candidates?.[0] || {};
  let text = '';

  if (cand?.content?.parts) {
    text = cand.content.parts.map(p=>p?.text||'').join('');
  } else if (Array.isArray(cand?.content)) {
    text = cand.content.map(p=>p?.text||'').join('');
  } else if (cand?.text) {
    text = cand.text;
  }

  return { model, text:(text||'').trim(), error:'' };
}

async function runGrok(model, prompt, max_tokens){
  const key = process.env.XAI_API_KEY;
  if (!key) return { model, text:'', error:'Trūksta XAI_API_KEY' };

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method:'POST',
    headers:{ 'content-type':'application/json', 'authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages: [{ role:'user', content: prompt }],
      max_tokens: Math.min(1024, max_tokens||512),
      stream: false
    })
  });

  if (!res.ok){
    let err = 'Grok HTTP '+res.status;
    try{ const j=await res.json(); if (j?.error?.message) err=j.error.message; }catch(_){}
    return { model, text:'', error: err };
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content
            || data?.choices?.[0]?.delta?.content
            || '';
  return { model, text:(text||'').trim(), error:'' };
}

