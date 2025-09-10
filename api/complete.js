export const config = { runtime: 'edge' };

const json = (obj, status=200) => new Response(JSON.stringify(obj), {
  status, headers:{
    'Content-Type':'application/json; charset=utf-8',
    'Access-Control-Allow-Origin':'*',
    'Cache-Control':'no-store'
  }
});
const bad = (code, msg) => new Response(msg||'Bad Request', {
  status: code, headers:{'Content-Type':'text/plain; charset=utf-8','Access-Control-Allow-Origin':'*'}
});

function splitModels(s){
  if (!s) return [];
  return String(s).split(',').map(x=>x.trim()).filter(Boolean);
}

async function callAnthropic(model, message){
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY missing');
  const r = await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'x-api-key': key,
      'anthropic-version':'2023-06-01'
    },
    body: JSON.stringify({
      model, max_tokens: 2048,
      messages:[{role:'user', content: String(message||'')}]
    })
  });
  if (!r.ok){ throw new Error(`Anthropic HTTP ${r.status}: ${await r.text()}`); }
  const data = await r.json();
  const text = (data?.content||[])
    .map(b=> b?.text || (b?.content?.map?.(c=>c?.text).join('')||''))
    .filter(Boolean).join('\n');
  return text || '';
}

async function callGoogle(model, message){
  const key = process.env.GOOGLE_API_KEY;
  if (!key) throw new Error('GOOGLE_API_KEY missing');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${key}`;
  const r = await fetch(url, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      contents:[{role:'user', parts:[{text:String(message||'')}]}]
    })
  });
  if (!r.ok){ throw new Error(`Google HTTP ${r.status}: ${await r.text()}`); }
  const data = await r.json();
  const text = data?.candidates?.[0]?.content?.parts?.map?.(p=>p?.text||'')?.join('') || '';
  return text;
}

async function callXAI(model, message){
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error('XAI_API_KEY missing');
  const r = await fetch('https://api.x.ai/v1/chat/completions', {
    method:'POST',
    headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
    body: JSON.stringify({
      model, stream:false,
      messages:[{role:'user', content: String(message||'')}]
    })
  });
  if (!r.ok){ throw new Error(`xAI HTTP ${r.status}: ${await r.text()}`); }
  const data = await r.json();
  const text = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || '';
  return text;
}

// fallback JSON ir kiti (jei kas nors specialiai kviestų)
async function callOpenAI(model, message){
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OPENAI_API_KEY missing');
  const r = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
    body: JSON.stringify({ model, stream:false, messages:[{role:'user', content: String(message||'')}] })
  });
  if (!r.ok){ throw new Error(`OpenAI HTTP ${r.status}: ${await r.text()}`); }
  const d = await r.json();
  return d?.choices?.[0]?.message?.content || '';
}
async function callDeepSeek(model, message){
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error('DEEPSEEK_API_KEY missing');
  const r = await fetch('https://api.deepseek.com/chat/completions',{
    method:'POST',
    headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
    body: JSON.stringify({ model, stream:false, messages:[{role:'user', content: String(message||'')}] })
  });
  if (!r.ok){ throw new Error(`DeepSeek HTTP ${r.status}: ${await r.text()}`); }
  const d = await r.json();
  return d?.choices?.[0]?.message?.content || '';
}
async function callTogether(model, message){
  const key = process.env.TOGETHER_API_KEY;
  if (!key) throw new Error('TOGETHER_API_KEY missing');
  const r = await fetch('https://api.together.xyz/v1/chat/completions',{
    method:'POST',
    headers:{'Authorization':'Bearer '+key,'Content-Type':'application/json'},
    body: JSON.stringify({ model, stream:false, messages:[{role:'user', content: String(message||'')}] })
  });
  if (!r.ok){ throw new Error(`Together HTTP ${r.status}: ${await r.text()}`); }
  const d = await r.json();
  return d?.choices?.[0]?.message?.content || d?.choices?.[0]?.text || '';
}

function providerFor(model){
  if (!model) return 'openai';
  if (model.startsWith('gpt-')) return 'openai';
  if (model === 'deepseek-chat') return 'deepseek';
  if (model.startsWith('meta-llama/')) return 'together';
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gemini-')) return 'google';
  if (model.startsWith('grok-')) return 'xai';
  return 'openai';
}

export default async function handler(req){
  try{
    if (req.method !== 'POST') return bad(405, 'Use POST');
    const body = await req.json().catch(()=> ({}));
    const message = body?.message || '';
    const models  = splitModels(body?.models || '');
    const chat_id = body?.chat_id || 'chat_'+Date.now();

    if (!message) return bad(400, 'message required');
    if (!models.length) return bad(400, 'models required');

    const answers = [];
    for (const model of models){
      try{
        const prov = providerFor(model);
        let text='';
        if (prov==='anthropic') text = await callAnthropic(model, message);
        else if (prov==='google') text = await callGoogle(model, message);
        else if (prov==='xai') text = await callXAI(model, message);
        else if (prov==='openai') text = await callOpenAI(model, message);
        else if (prov==='deepseek') text = await callDeepSeek(model, message);
        else if (prov==='together') text = await callTogether(model, message);
        answers.push({ model, text });
      }catch(err){
        answers.push({ model, text: '' }); // paliekam tuščią – UI parodys klaidą
      }
    }

    // jei nė vienas neatkeliavo – parodykim priežastį
    const hasAny = answers.some(a=> (a.text||'').trim().length>0);
    if (!hasAny){
      return json({ ok:false, chat_id, answers, message:'No provider returned text. Check API keys & quotas.' }, 200);
    }

    return json({ ok:true, chat_id, answers });

  }catch(e){
    return bad(500, 'COMPLETE_FAILED: '+(e?.message||String(e)));
  }
}

