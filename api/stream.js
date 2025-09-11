// filename: api/stream.js
export const config = { runtime: 'edge' };

// --- SSE helperiai ---
const enc = new TextEncoder();
const dec = new TextDecoder();
const okHdrs = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store, no-transform',
  'X-Accel-Buffering': 'no',
  'Access-Control-Allow-Origin': '*'
};
const sse = {
  data: (objOrStr) => `data: ${typeof objOrStr === 'string' ? objOrStr : JSON.stringify(objOrStr)}\n\n`,
  delta: (text) => `data: ${JSON.stringify({ choices: [{ delta: { content: String(text) } }] })}\n\n`,
  event: (name, payload) => `event: ${name}\n${payload ? `data: ${JSON.stringify(payload)}\n` : ''}\n`,
  done: () => `data: [DONE]\n\n`,
};

function isOpenAI(m=''){ return /^gpt-/i.test(m); }
function isAnthropic(m=''){ return /^claude/i.test(m) || /sonnet/i.test(m); }
function isDeepSeek(m=''){ return /deepseek/i.test(m); }
function isXAI(m=''){ return /grok/i.test(m); }
function isGemini(m=''){ return /^(gemini[-\w]*|google\/)/i.test(m); }
function isLlamaFamily(m=''){ return /meta-llama|llama/i.test(m); }
function cleanModelId(m=''){ return String(m).replace(/^openrouter\//i,'').replace(/^together\//i,''); }

function getenv(name){ return (process.env[name] || '').trim(); }
const HAS = {
  OPENAI: !!getenv('OPENAI_API_KEY'),
  ANTHROPIC: !!getenv('ANTHROPIC_API_KEY'),
  GOOGLE: !!(getenv('GOOGLE_API_KEY') || getenv('GEMINI_API_KEY')),
  XAI: !!getenv('XAI_API_KEY'),
  DEEPSEEK: !!getenv('DEEPSEEK_API_KEY'),
  OPENROUTER: !!getenv('OPENROUTER_API_KEY'),
  TOGETHER: !!getenv('TOGETHER_API_KEY')
};

// ——— Universalus writer’is į klientą
function streamResponse(executor){
  const stream = new ReadableStream({
    async start(controller){
      const write = (chunk) => controller.enqueue(enc.encode(chunk));
      const close = () => controller.close();
      const fail  = (e) => { try { write(sse.event('error', { message: String(e?.message || e) })); write(sse.done()); } finally { close(); } };

      try {
        await executor({ write, close, fail });
      } catch (e) {
        fail(e);
      }
    }
  });
  return new Response(stream, { headers: okHdrs });
}

// ——— OpenAI stream (su fallback jei org. neleidžia stream’inti)
async function pumpOpenAI({ model, message, maxTokens, write }){
  const body = {
    model,
    stream: true,
    messages: [{ role: 'user', content: String(message) }],
    max_completion_tokens: maxTokens
  };
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${getenv('OPENAI_API_KEY')}` },
    body: JSON.stringify(body)
  });

  // Jei stream draudžiamas – darom non-stream ir patys „suSSE’inam“
  if (!resp.ok) {
    const r2 = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${getenv('OPENAI_API_KEY')}` },
      body: JSON.stringify({ ...body, stream:false })
    });
    const j = await r2.json().catch(()=>null);
    if (!r2.ok) throw new Error(`OpenAI HTTP ${r2.status}: ${j?.error?.message || 'request failed'}`);
    const text = j?.choices?.[0]?.message?.content || '';
    for (const part of String(text).split(/(\s+)/)) {
      if (part) write(sse.delta(part));
      await new Promise(r=>setTimeout(r, 8));
    }
    return;
  }

  // Tikras SSE
  const reader = resp.body.getReader();
  let buf = '';
  for(;;){
    const {done, value} = await reader.read(); if (done) break;
    buf += dec.decode(value, {stream:true});
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const frame = buf.slice(0, i).trim(); buf = buf.slice(i+2);
      if (!frame) continue;
      const dataLine = frame.split('\n').find(l => l.startsWith('data:'));
      if (!dataLine) continue;
      const payload = dataLine.replace(/^data:\s*/,'').trim();
      if (payload === '[DONE]') return;
      try {
        const j = JSON.parse(payload);
        const piece = j?.choices?.[0]?.delta?.content || '';
        if (piece) write(sse.delta(piece));
      } catch(_){}
    }
  }
}

// ——— Anthropic (Claude) — su MODELIO FALLBACK jeigu 404
function anthropicCandidates(requested){
  const m = String(requested||'');
  // jei paprašyta „claude-4-sonnet“, bandome žemyn iki 3.5
  if (/^claude-4-sonnet/i.test(m)) {
    return [
      'claude-4-sonnet',
      'claude-3-7-sonnet-latest',
      'claude-3-5-sonnet-20241022',
      'claude-3-5-sonnet-latest'
    ];
  }
  // jei paprašyta „latest“ – paliekam kaip yra
  return [m];
}
async function pumpAnthropic({ model, message, maxTokens, write }){
  const tries = anthropicCandidates(model);
  let last404 = null;

  for (const tryModel of tries){
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{
        'Content-Type':'application/json',
        'x-api-key': getenv('ANTHROPIC_API_KEY'),
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: tryModel,
        max_tokens: maxTokens,
        stream: true,
        messages: [{ role:'user', content:String(message) }]
      })
    });

    if (!resp.ok){
      const txt = await resp.text().catch(()=>String(resp.status));
      if (resp.status === 404) { last404 = `${tryModel}: ${txt.slice(0,200)}`; continue; }
      throw new Error(`Anthropic HTTP ${resp.status}: ${txt.slice(0,300)}`);
    }

    // sėkmingas stream — pumpuojam ir baigiam
    const reader = resp.body.getReader();
    let buf = '';
    for(;;){
      const {done, value} = await reader.read(); if (done) break;
      buf += dec.decode(value, {stream:true});
      let i;
      while ((i = buf.indexOf('\n\n')) >= 0){
        const frame = buf.slice(0,i).trim(); buf = buf.slice(i+2);
        if (!frame) continue;
        const evLine = frame.split('\n').find(l=>l.startsWith('event:'));
        const dataLine = frame.split('\n').find(l=>l.startsWith('data:'));
        const ev = evLine ? evLine.replace(/^event:\s*/,'').trim() : '';
        const data = dataLine ? dataLine.replace(/^data:\s*/,'').trim() : '';
        if (data === '[DONE]') return;
        if (ev === 'error'){ write(sse.event('error', {message:data})); continue; }
        if (ev === 'content_block_delta'){
          try { const j = JSON.parse(data); const piece = j?.delta?.text || ''; if (piece) write(sse.delta(piece)); } catch(_){}
        }
      }
    }
    return;
  }

  // nieko neradome
  throw new Error(`Anthropic model not found. Tried: ${tries.join(', ')}${last404 ? ` • last 404: ${last404}` : ''}`);
}

// ——— DeepSeek (OpenAI-style)
async function pumpDeepSeek({ model, message, maxTokens, write }){
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${getenv('DEEPSEEK_API_KEY')}` },
    body: JSON.stringify({
      model, stream:true,
      messages:[{role:'user', content:String(message)}],
      max_tokens: maxTokens
    })
  });
  if (!resp.ok){
    const txt = await resp.text().catch(()=>String(resp.status));
    throw new Error(`DeepSeek HTTP ${resp.status}: ${txt.slice(0,300)}`);
  }
  const reader=resp.body.getReader();
  let buf='';
  for(;;){
    const {done,value}=await reader.read(); if(done) break;
    buf+=dec.decode(value,{stream:true});
    let i; while((i=buf.indexOf('\n\n'))>=0){
      const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
      if(!frame) continue;
      const dataLine=frame.split('\n').find(l=>l.startsWith('data:'));
      if(!dataLine) continue;
      const data=dataLine.replace(/^data:\s*/,'').trim();
      if (data==='[DONE]') return;
      try{ const j=JSON.parse(data); const piece=j?.choices?.[0]?.delta?.content||''; if(piece) write(sse.delta(piece)); }catch(_){}
    }
  }
}

// ——— xAI Grok
async function pumpGrok({ model, message, write }){
  const resp = await fetch('https://api.x.ai/v1/chat/completions', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${getenv('XAI_API_KEY')}` },
    body: JSON.stringify({
      model, stream:true,
      messages:[{role:'user', content:String(message)}],
      search_parameters: { mode: 'auto' }
    })
  });
  if (!resp.ok){
    const txt = await resp.text().catch(()=>String(resp.status));
    throw new Error(`Grok HTTP ${resp.status}: ${txt.slice(0,300)}`);
  }
  const reader=resp.body.getReader();
  let buf='';
  for(;;){
    const {done,value}=await reader.read(); if(done) break;
    buf+=dec.decode(value,{stream:true});
    let i; while((i=buf.indexOf('\n\n'))>=0){
      const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
      if(!frame) continue;
      const dataLine=frame.split('\n').find(l=>l.startsWith('data:'));
      if(!dataLine) continue;
      const data=dataLine.replace(/^data:\s*/,'').trim();
      if (data==='[DONE]') return;
      try{ const j=JSON.parse(data); const piece=j?.choices?.[0]?.delta?.content||''; if(piece) write(sse.delta(piece)); }catch(_){}
    }
  }
}

// ——— Google Gemini: NDJSON -> SSE
async function pumpGemini({ model, message, maxTokens, write }){
  const key = getenv('GOOGLE_API_KEY') || getenv('GEMINI_API_KEY');
  if (!key) throw new Error('Missing GOOGLE_API_KEY/GEMINI_API_KEY');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?key=${key}`;
  const resp = await fetch(endpoint, {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts:[{ text:String(message) }]}],
      generationConfig: { maxOutputTokens: maxTokens }
    })
  });
  if (!resp.ok){
    const txt = await resp.text().catch(()=>String(resp.status));
    throw new Error(`Gemini HTTP ${resp.status}: ${txt.slice(0,300)}`);
  }
  const reader = resp.body.getReader();
  let buf = '';
  for(;;){
    const {done, value} = await reader.read(); if (done) break;
    buf += dec.decode(value, {stream:true});
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx+1);
      if (!line) continue;
      try{
        const j = JSON.parse(line);
        const cands = j?.candidates || [];
        for (const c of cands){
          const parts = (c?.content?.parts) || (c?.delta?.parts) || [];
          for (const p of parts){
            const piece = p?.text || '';
            if (piece) write(sse.delta(piece));
          }
        }
      }catch(_){}
    }
  }
}

// ——— OpenRouter (OpenAI-style)
async function pumpOpenRouter({ model, message, maxTokens, write }){
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      'Authorization': `Bearer ${getenv('OPENROUTER_API_KEY')}`,
      'HTTP-Referer': getenv('SITE_URL') || 'https://paule.app',
      'X-Title': 'Paule'
    },
    body: JSON.stringify({
      model: cleanModelId(model),
      stream: true,
      messages: [{ role:'user', content:String(message) }],
      max_tokens: maxTokens
    })
  });
  if (!resp.ok){
    const txt = await resp.text().catch(()=>String(resp.status));
    throw new Error(`OpenRouter HTTP ${resp.status}: ${txt.slice(0,300)}`);
  }
  const reader=resp.body.getReader();
  let buf='';
  for(;;){
    const {done,value}=await reader.read(); if(done) break;
    buf+=dec.decode(value,{stream:true});
    let i; while((i=buf.indexOf('\n\n'))>=0){
      const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
      if(!frame) continue;
      const dataLine=frame.split('\n').find(l=>l.startsWith('data:'));
      if(!dataLine) continue;
      const data=dataLine.replace(/^data:\s*/,'').trim();
      if (data==='[DONE]') return;
      try{ const j=JSON.parse(data); const piece=j?.choices?.[0]?.delta?.content||''; if(piece) write(sse.delta(piece)); }catch(_){}
    }
  }
}

// ——— Together (OpenAI-style)
async function pumpTogether({ model, message, maxTokens, write }){
  const resp = await fetch('https://api.together.ai/v1/chat/completions', {
    method:'POST',
    headers:{ 'Content-Type':'application/json', 'Authorization': `Bearer ${getenv('TOGETHER_API_KEY')}` },
    body: JSON.stringify({
      model: cleanModelId(model),
      stream: true,
      messages: [{ role:'user', content:String(message) }],
      max_tokens: maxTokens
    })
  });
  if (!resp.ok){
    const txt = await resp.text().catch(()=>String(resp.status));
    throw new Error(`Together HTTP ${resp.status}: ${txt.slice(0,300)}`);
  }
  const reader=resp.body.getReader();
  let buf='';
  for(;;){
    const {done,value}=await reader.read(); if(done) break;
    buf+=dec.decode(value,{stream:true});
    let i; while((i=buf.indexOf('\n\n'))>=0){
      const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
      if(!frame) continue;
      const dataLine=frame.split('\n').find(l=>l.startsWith('data:'));
      if(!dataLine) continue;
      const data=dataLine.replace(/^data:\s*/,'').trim();
      if (data==='[DONE]') return;
      try{ const j=JSON.parse(data); const piece=j?.choices?.[0]?.delta?.content||''; if(piece) write(sse.delta(piece)); }catch(_){}
    }
  }
}

export default async function handler(req) {
  const url = new URL(req.url);
  const modelRaw = url.searchParams.get('model') || '';
  const model = cleanModelId(modelRaw);
  const message = url.searchParams.get('message') || '';
  const maxTokens = Math.max(1, parseInt(url.searchParams.get('max_tokens') || '1024', 10));
  if (!model || !message) {
    return new Response(sse.data({ ok:false, message:'model and message required' }) + sse.done(), { headers: okHdrs });
  }

  return streamResponse(async ({ write, fail, close })=>{
    try {
      if (isOpenAI(model) && HAS.OPENAI) {
        await pumpOpenAI({ model, message, maxTokens, write }); write(sse.done()); return close();
      }
      if (isAnthropic(model) && HAS.ANTHROPIC) {
        await pumpAnthropic({ model, message, maxTokens, write }); write(sse.done()); return close();
      }
      if (isDeepSeek(model) && HAS.DEEPSEEK) {
        await pumpDeepSeek({ model, message, maxTokens, write }); write(sse.done()); return close();
      }
      if (isXAI(model) && HAS.XAI) {
        await pumpGrok({ model, message, write }); write(sse.done()); return close();
      }
      if (isGemini(model) && HAS.GOOGLE) {
        await pumpGemini({ model, message, maxTokens, write }); write(sse.done()); return close();
      }
      if (isLlamaFamily(model)) {
        if (HAS.TOGETHER) { await pumpTogether({ model, message, maxTokens, write }); write(sse.done()); return close(); }
        if (HAS.OPENROUTER){ await pumpOpenRouter({ model, message, maxTokens, write }); write(sse.done()); return close(); }
        throw new Error('Llama tiekėjui trūksta API rakto (TOGETHER_API_KEY arba OPENROUTER_API_KEY).');
      }

      // universalus fallback — OpenRouter
      if (HAS.OPENROUTER) {
        await pumpOpenRouter({ model, message, maxTokens, write }); write(sse.done()); return close();
      }

      throw new Error(`Unsupported model or missing API key: ${model}`);
    } catch (e) {
      write(sse.event('error', { message: String(e?.message || e) }));
      write(sse.done());
      return close();
    }
  });
}
