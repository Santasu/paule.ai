// Anthropic – thinking pataisymas
async function askAnthropic(model){
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY || '',
      'anthropic-version':'2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: Number(max_tokens)||1024,
      messages:[{role:'user', content:String(message)}],
      thinking: thinking ? { type: 'enabled', budget_tokens: 2048 } : undefined
    })
  });
// ...
}

// OpenAI – max_completion_tokens vietoje max_tokens
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
      max_completion_tokens: Number(max_tokens)||1024
    })
  });
// ...
}

// Llama / Paule – Together **arba** OpenRouter**
async function askOpenRouterOrTogether(model){
  const hasOR = !!(process.env.OPENROUTER_API_KEY);
  const hasTG = !!(process.env.TOGETHER_API_KEY);

  if (!hasOR && hasTG){
    // Together
    const r = await fetch('https://api.together.xyz/v1/chat/completions', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'Authorization':`Bearer ${process.env.TOGETHER_API_KEY||''}`
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

  // OpenRouter
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
