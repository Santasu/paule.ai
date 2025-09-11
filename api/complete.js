// /api/complete.js
export default async function handler(req, res){
  try{
    if (req.method !== 'POST'){ res.status(405).json({ok:false,message:'Method not allowed'}); return; }

    const { message = '', models = '', max_tokens = 1024, search = 'auto', thinking = false } = req.body || {};
    const list = String(models||'').split(',').map(s=>s.trim()).filter(Boolean);

    const isAnthropic = m => /^claude|sonnet/i.test(m);
    const isXAI       = m => /grok/i.test(m);
    const isOpenAI    = m => /^gpt-/i.test(m);
    const isDeepSeek  = m => /deepseek/i.test(m);
    const isOpenRouter= m => /meta-llama|llama|openrouter\//i.test(m);
    const isGemini    = m => /^(gemini[-\w]*|google\/)/i.test(m);

    async function askAnthropic(model){
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY || '',
          'anthropic-version':'2023-06-01'
        },
        body: JSON.stringify({
          model, max_tokens: Number(max_tokens)||1024,
          messages:[{role:'user', content:String(message)}],
          thinking: thinking ? { budget_tokens: 2048 } : undefined
        })
      });
      const j = await r.json().catch(()=>null);
      if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
      const text = Array.isArray(j?.content) ? (j.content.find(b=>b.type==='text')?.text || '') : (j?.content?.[0]?.text || '');
      return { model, text };
    }

    async function askXAI(model){
      const r = await fetch('https://api.x.ai/v1/chat/completions', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':`Bearer ${process.env.XAI_API_KEY||''}`
        },
        body: JSON.stringify({
          model, stream:false,
          messages:[{role:'user', content:String(message)}],
          search_parameters: { mode: search || 'auto' }
        })
      });
      const j = await r.json().catch(()=>null);
      if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
      return { model, text: j?.choices?.[0]?.message?.content || '' };
    }

    async function askOpenAI(model){
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':`Bearer ${process.env.OPENAI_API_KEY||''}`
        },
        body: JSON.stringify({
          model, stream:false,
          messages:[{role:'user', content:String(message)}],
          max_tokens:Number(max_tokens)||1024
        })
      });
      const j = await r.json().catch(()=>null);
      if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
      return { model, text: j?.choices?.[0]?.message?.content || '' };
    }

    async function askDeepSeek(model){
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':`Bearer ${process.env.DEEPSEEK_API_KEY||''}`
        },
        body: JSON.stringify({
          model, stream:false,
          messages:[{role:'user', content:String(message)}],
          max_tokens:Number(max_tokens)||1024
        })
      });
      const j = await r.json().catch(()=>null);
      if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
      return { model, text: j?.choices?.[0]?.message?.content || '' };
    }

    async function askOpenRouter(model){
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          'Authorization':`Bearer ${process.env.OPENROUTER_API_KEY||''}`,
          'HTTP-Referer': (process.env.SITE_URL||'https://paule.app'),
          'X-Title':'Paule'
        },
        body: JSON.stringify({
          model, stream:false,
          messages:[{role:'user', content:String(message)}],
          max_tokens:Number(max_tokens)||1024
        })
      });
      const j = await r.json().catch(()=>null);
      if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
      return { model, text: j?.choices?.[0]?.message?.content || '' };
    }

    // ✅ GEMINI
    async function askGemini(model){
      const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
      if (!key) return { model, error:'Missing GOOGLE_API_KEY' };
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
      const r = await fetch(endpoint, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          contents: [{ role:'user', parts:[{ text:String(message) }]}],
          generationConfig: { maxOutputTokens: Number(max_tokens)||1024 }
        })
      });
      const j = await r.json().catch(()=>null);
      if (!r.ok) return { model, error: j?.error?.message || `HTTP ${r.status}` };
      const text = j?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || '';
      return { model, text };
    }

    const answers = [];
    for (const m of list){
      try{
        if (isAnthropic(m))   { answers.push(await askAnthropic(m));   continue; }
        if (isXAI(m))         { answers.push(await askXAI(m));         continue; }
        if (isOpenAI(m))      { answers.push(await askOpenAI(m));      continue; }
        if (isDeepSeek(m))    { answers.push(await askDeepSeek(m));    continue; }
        if (isOpenRouter(m))  { answers.push(await askOpenRouter(m));  continue; }
        if (isGemini(m))      { answers.push(await askGemini(m));      continue; }
        answers.push({ model:m, error:`not_implemented` });
      }catch(e){
        answers.push({ model:m, error:String(e?.message||e) });
      }
    }

    res.status(200).json({ ok:true, answers });
  }catch(e){
    res.status(500).json({ ok:false, message:String(e?.message||e) });
  }
}
