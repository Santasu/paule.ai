export const config = { runtime: 'edge' };

// —————————————————— Helpers ——————————————————
const enc = new TextEncoder();
const ok = (body) => new Response(body, {
  status: 200,
  headers: {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': '*',
  }
});
const bad = (code, msg) => new Response(msg || 'Bad Request', {
  status: code, headers: { 'Content-Type': 'text/plain; charset=utf-8','Access-Control-Allow-Origin':'*' }
});
const sendLine = (controller, line) => controller.enqueue(enc.encode(line.endsWith('\n')?line:line+'\n'));
const ev = (t, d) => `event: ${t}\ndata: ${typeof d==='string'?d:JSON.stringify(d)}\n\n`;

function modelProvider(model){
  if (!model) return {kind:'auto'};
  if (model.startsWith('gpt-')) return {kind:'openai'};
  if (model === 'deepseek-chat') return {kind:'deepseek'};
  if (model.startsWith('meta-llama/')) return {kind:'together'};
  // jei auto – naudok openai kaip default stream
  return {kind:'openai'};
}

async function pipeOpenAISSE({controller, model, message, max_tokens}){
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY missing');
  const r = await fetch('https://api.openai.com/v1/chat/completions',{
    method:'POST',
    headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},
    body: JSON.stringify({
      model, stream:true, max_tokens: max_tokens||4096,
      messages:[{role:'user', content: String(message||'')}]
    })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`OpenAI HTTP ${r.status}: ${t}`);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  while (true){
    const {done, value} = await reader.read();
    if (done) break;
    const chunk = dec.decode(value, {stream:true});
    const lines = chunk.split(/\r?\n/);
    for (const line of lines){
      if (!line.trim()) continue;
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]'){ sendLine(controller, ev('done',{})); return; }
      try {
        const obj = JSON.parse(data);
        const delta = obj?.choices?.[0]?.delta?.content || '';
        if (delta) sendLine(controller, ev('delta', JSON.stringify({delta})));
      }catch(_){}
    }
  }
}

async function pipeDeepseekSSE({controller, model, message, max_tokens}){
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error('DEEPSEEK_API_KEY missing');
  const r = await fetch('https://api.deepseek.com/chat/completions',{
    method:'POST',
    headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},
    body: JSON.stringify({
      model, stream:true, max_tokens: max_tokens||4096,
      messages:[{role:'user', content: String(message||'')}]
    })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`DeepSeek HTTP ${r.status}: ${t}`);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  while (true){
    const {done, value} = await reader.read();
    if (done) break;
    const chunk = dec.decode(value, {stream:true});
    const lines = chunk.split(/\r?\n/);
    for (const line of lines){
      if (!line.trim() || !line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]'){ sendLine(controller, ev('done',{})); return; }
      try {
        const obj = JSON.parse(data);
        const delta = obj?.choices?.[0]?.delta?.content || '';
        if (delta) sendLine(controller, ev('delta', JSON.stringify({delta})));
      }catch(_){}
    }
  }
}

async function pipeTogetherSSE({controller, model, message, max_tokens}){
  const apiKey = process.env.TOGETHER_API_KEY;
  if (!apiKey) throw new Error('TOGETHER_API_KEY missing');
  const r = await fetch('https://api.together.xyz/v1/chat/completions',{
    method:'POST',
    headers:{'Authorization':'Bearer '+apiKey,'Content-Type':'application/json'},
    body: JSON.stringify({
      model, stream:true, max_tokens: max_tokens||4096,
      messages:[{role:'user', content: String(message||'')}]
    })
  });
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`Together HTTP ${r.status}: ${t}`);
  }
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  while (true){
    const {done, value} = await reader.read();
    if (done) break;
    const chunk = dec.decode(value, {stream:true});
    const lines = chunk.split(/\r?\n/);
    for (const line of lines){
      if (!line.trim() || !line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]'){ sendLine(controller, ev('done',{})); return; }
      try {
        const obj = JSON.parse(data);
        const delta = obj?.choices?.[0]?.delta?.content || obj?.choices?.[0]?.text || '';
        if (delta) sendLine(controller, ev('delta', JSON.stringify({delta})));
      }catch(_){}
    }
  }
}

// —————————————————— Handler ——————————————————
export default async function handler(req){
  try{
    if (req.method !== 'GET') return bad(405,'Use GET');
    const { searchParams } = new URL(req.url);
    const model   = searchParams.get('model') || searchParams.get('models') || 'gpt-4o-mini';
    const message = searchParams.get('message') || '';
    const chat_id = searchParams.get('chat_id') || 'chat_'+Date.now();
    const max_tokens = Number(searchParams.get('max_tokens') || 4096);

    const {kind} = modelProvider(model);

    const stream = new ReadableStream({
      async start(controller){
        // start
        sendLine(controller, ev('start', JSON.stringify({model, chat_id})));

        try{
          if (kind==='openai'){
            await pipeOpenAISSE({controller, model, message, max_tokens});
          }else if (kind==='deepseek'){
            await pipeDeepseekSSE({controller, model, message, max_tokens});
          }else if (kind==='together'){
            await pipeTogetherSSE({controller, model, message, max_tokens});
          }else{
            throw new Error('Unsupported SSE model: '+model);
          }
        }catch(err){
          sendLine(controller, ev('error', {message: String(err?.message||err||'SSE error')}));
        }finally{
          try{ controller.close(); }catch(_){}
        }
      }
    });

    return ok(stream);

  }catch(e){
    return bad(500, 'STREAM_FAILED: '+(e?.message||String(e)));
  }
}
