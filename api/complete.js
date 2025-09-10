// /api/complete.js
export const config = { runtime: 'edge' };

const okJSON = (obj, status=200) =>
  new Response(JSON.stringify(obj), { status, headers: {
    'Content-Type':'application/json',
    'Cache-Control':'no-store',
    'Access-Control-Allow-Origin':'*'
  }});

export default async function handler(req) {
  try{
    const { message='', models='', chat_id=null, max_tokens=4096 } = await req.json();
    const backIds = String(models||'').split(',').map(s=>s.trim()).filter(Boolean);
    const tasks = backIds.map(m => runModel(m, message, max_tokens));
    const results = await Promise.all(tasks);

    const answers = results.map(r => ({
      model: r.model,
      text:  r.text || '',
      error: r.error || ''
    }));

    // minimal compatibility su tavo UI (papildomos klaidos)
    const errors = results
      .filter(r => r.error)
      .map(r => ({ front: r.front || r.model, error: r.error }));

    return okJSON({ ok:true, chat_id: chat_id || null, answers, errors });
  }catch(e){
    return okJSON({ ok:false, answers:[], errors:[{ error: (e && e.message) || 'Server error' }] }, 500);
  }
}

// --- Driveriai ---

async function runModel(backId, prompt, max_tokens) {
  const id = (backId||'').trim();
  try{
    if (!id) return { model:id, error:'Modelis nepaduotas' };

    if (id.startsWith('claude'))   return await runClaude(id, prompt, max_tokens);
    if (id.startsWith('gemini'))   return await runGemini(id, prompt, max_tokens);
    if (id.startsWith('grok'))     return await runGrok(id, prompt, max_tokens);

    // jei netyčia JSON keliu ateis SSE modelis – grąžinam aiškų pranešimą
    return { model:id, error:'Šis modelis numatytas SSE srautui (naudok /api/stream).' };
  }catch(e){
    return { model:id, error:(e && e.message) || String(e) };
  }
}

// --- Claude (Anthropic) ---
async function runClaude(model, prompt, max_tokens){
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { model, error:'Trūksta ANTHROPIC_API_KEY' };

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
    let err='Anthropic HTTP '+res.status;
    try{ const j=await res.json(); if (j?.error?.message) err=j.error.message; }catch(_){}
    return { model, error: err };
  }
  const data = await res.json();
  // data.content = [{type:'text',text:'...'}]
  const text = Array.isArray(data?.content) ? data.content.map(p=>p.text||'').join('') : (data?.output_text||'');
  return { model, text: (text||'').trim() };
}

// --- Gemini (Google) ---
async function runGemini(model, prompt, max_tokens){
  const key = process.env.GOOGLE_API_KEY;
  if (!key) return { model, error:'Trūksta GOOGLE_API_KEY' };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
  const body = { contents: [{ role:'user', parts:[{ text: prompt }]}], generationConfig: { maxOutputTokens: Math.min(1024, max_tokens||512) } };

  const res = await fetch(url, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify(body) });
  if (!res.ok){
    let err='Gemini HTTP '+res.status;
    try{ const j=await res.json(); if (j?.error?.message) err=j.error.message; }catch(_){}
    return { model, error: err };
  }
  const data = await res.json();
  const cand = (data?.candidates && data.candidates[0]) || {};
  const parts = cand?.content?.parts || [];
  const text  = parts.map(p=>p?.text||'').join('');
  return { model, text: (text||'').trim() };
}

// --- Grok (xAI) ---
async function runGrok(model, prompt, max_tokens){
  const key = process.env.XAI_API_KEY;
  if (!key) return { model, error:'Trūksta XAI_API_KEY' };

  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method:'POST',
    headers:{ 'content-type':'application/json', 'authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model: model, // pvz. "grok-4"
      messages: [{ role:'user', content: prompt }],
      max_tokens: Math.min(1024, max_tokens||512),
      stream: false
    })
  });

  if (!res.ok){
    let err='Grok HTTP '+res.status;
    try{ const j=await res.json(); if (j?.error?.message) err=j.error.message; }catch(_){}
    return { model, error: err };
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.delta?.content || '';
  return { model, text: (text||'').trim() };
}

