// filename: api/complete.js
export default async function handler(req, res){
  try{
    if (req.method !== 'POST'){ res.status(405).json({ ok:false, message:'Method not allowed' }); return; }

    const {
      message = '',
      models  = '',
      max_tokens = 1024,
      search = 'auto',
      thinking = false
    } = req.body || {};

    const list = String(models||'').split(',').map(s=>s.trim()).filter(Boolean);

    const isOpenAI     = (m='') => /^gpt-/i.test(m);
    const isAnthropic  = (m='') => /^claude|sonnet/i.test(m);
    const isGemini     = (m='') => /^(gemini[-\w]*|google\/)/i.test(m);
    const isXAI        = (m='') => /grok/i.test(m);
    const isDeepSeek   = (m='') => /deepseek/i.test(m);
    const isOpenRouter = (m='') => /meta-llama|llama|openrouter\//i.test(m);

    const answers = [];
    for (const model of list){
      try{
        if (isAnthropic(model))  { answers.push(await askAnthropic(model, message, max_tokens, thinking)); continue; }
        if (isXAI(model))        { answers.push(await askXAI(model, message, search)); continue; }
        if (isOpenAI(model))     { answers.push(await askOpenAI(model, message, max_tokens)); continue; }
        if (isDeepSeek(model))   { answers.push(await askDeepSeek(model, message, max_tokens)); continue; }
        if (isOpenRouter(model)) { answers.push(await askOpenRouterOrTogether(model, message, max_tokens)); continue; }
        if (isGemini(model))     { answers.push(await askGemini(model, message, max_tokens)); continue; }
        answers.push({ model, error:'not_implemented' });
      }catch(e){
        answers.push({ model, error: String(e?.message || e) });
      }
    }

    res.status(200).json({ ok:true, answers });
  }catch(e){
    res.status(500).json({ ok:false, message: String(e?.message || e) });
  }
}

// ——— Tiekėjai (JSON) ———
async function askOpenAI(model, message, max_tokens){
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`
    },
    body: JSON.stringify({
      model, stream:false,
      messages:[{ role:'user', content:String(message) }],
      // svarbu: max_completion_tokens
      max_completion_tokens: Number(max_tokens)||1024
    })
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
  return { model, text: j?.choices?.[0]?.message?.content || '' };
}

async function askAnthropic(model, message, max_tokens, thinking){
  const body = {
    model, stream:false,
    max_tokens: Number(max_tokens)||1024,
    messages:[{ role:'user', content:String(message) }]
  };
  if (thinking) body.thinking = { type:'enabled', budget_tokens: 2048 };

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-api-key': (process.env.ANTHROPIC_API_KEY || ''),
      'anthropic-version':'2023-06-01'
    },
    body: JSON.stringify(body)
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
  const text = Array.isArray(j?.content) ? (j.content.find(b=>b.type==='text')?.text || '') : (j?.content?.[0]?.text || '');
  return { model, text };
}

async function askXAI(model, message, search){
  const r = await fetch('https://api.x.ai/v1/chat/completions', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization': `Bearer ${process.env.XAI_API_KEY || ''}`
    },
    body: JSON.stringify({
      model, stream:false,
      messages:[{ role:'user', content:String(message) }],
      search_parameters: search ? { mode: search } : undefined
    })
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
  return { model, text: j?.choices?.[0]?.message?.content || '' };
}

async function askDeepSeek(model, message, max_tokens){
  const r = await fetch('https://api.deepseek.com/chat/completions', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY || ''}`
    },
    body: JSON.stringify({
      model, stream:false,
      messages:[{ role:'user', content:String(message) }],
      max_tokens: Number(max_tokens)||1024
    })
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
  return { model, text: j?.choices?.[0]?.message?.content || '' };
}

async function askOpenRouterOrTogether(model, message, max_tokens){
  const orKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (orKey){
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization': `Bearer ${orKey}`,
        'HTTP-Referer': (process.env.SITE_URL || 'https://paule.app'),
        'X-Title': 'Paule'
      },
      body: JSON.stringify({
        model, stream:false,
        messages:[{ role:'user', content:String(message) }],
        max_tokens: Number(max_tokens)||1024
      })
    });
    const j = await r.json().catch(()=>null);
    if (r.ok) return { model, text: j?.choices?.[0]?.message?.content || '' };
    if (![401,403].includes(r.status)) return { model, error: j?.error?.message || `HTTP ${r.status}` };
    // kitu atveju – krentam į Together
  }
  const tgKey = (process.env.TOGETHER_API_KEY || '').trim();
  if (!tgKey) return { model, error: 'Trūksta OPENROUTER_API_KEY arba TOGETHER_API_KEY' };
  const r2 = await fetch('https://api.together.xyz/v1/chat/completions', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization': `Bearer ${tgKey}`
    },
    body: JSON.stringify({
      model, stream:false,
      messages:[{ role:'user', content:String(message) }],
      max_tokens: Number(max_tokens)||1024
    })
  });
  const j2 = await r2.json().catch(()=>null);
  if (!r2.ok) return { model, error: j2?.error?.message || `HTTP ${r2.status}` };
  return { model, text: j2?.choices?.[0]?.message?.content || j2?.output_text || '' };
}

async function askGemini(model, message, max_tokens){
  const key = (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim();
  if (!key) return { model, error:'Missing GOOGLE_API_KEY/GEMINI_API_KEY' };
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
  const r = await fetch(endpoint, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({
      contents:[{ role:'user', parts:[{ text:String(message) }]}],
      generationConfig:{ maxOutputTokens: Number(max_tokens)||1024 }
    })
  });
  const j = await r.json().catch(()=>null);
  if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
  const text = j?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || '';
  return { model, text };
}
