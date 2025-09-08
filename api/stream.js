// /api/stream.js
// Vieningas SSE gateway. Visi tiekėjai grąžinami formatu:
// data: {"choices":[{"delta":{"role":"assistant","content":"..."}}]}

function sseHeaders(res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.setHeader('Access-Control-Allow-Origin', '*');
  try { res.write(':' + ' '.repeat(2048) + '\n'); } catch(_) {}
  res.flushHeaders?.();
}

function writeDelta(res, text) {
  if (!text) return;
  res.write(`data: ${JSON.stringify({ choices:[{ delta:{ role:'assistant', content:String(text) } }] })}\n\n`);
}
function endSSE(res){ try{ res.write('data: [DONE]\n\n'); res.end(); }catch(_){ } }

function getBody(req){
  return new Promise((resolve)=>{
    if (req.method !== 'POST') return resolve(null);
    let data=''; req.on('data',c=>data+=c); req.on('end',()=>{ try{resolve(JSON.parse(data||'{}'));}catch{resolve(null);} });
  });
}

// ---- helpers ---------------------------------------------------------------

/** OpenAI-like SSE parser (OpenAI, DeepSeek, Together, xAI/Grok) */
async function streamOpenAILike({ url, apiKey, model, userText, imageUrl, extraHeaders = {}, extraBody = {} }, res) {
  const userContent = imageUrl
    ? [{ type:'text', text:userText||'' }, { type:'image_url', image_url:{ url:imageUrl, detail:'high' } }]
    : [{ type:'text', text:userText||'' }];

  const body = {
    model,
    stream: true,
    messages: [{ role:'user', content:userContent }],
    ...extraBody
  };

  const resp = await fetch(url, {
    method:'POST',
    headers:{ 'Authorization':`Bearer ${apiKey}`, 'Content-Type':'application/json', ...extraHeaders },
    body: JSON.stringify(body)
  });

  if (!resp.ok || !resp.body){
    writeDelta(res, `⚠️ ${model}: ${resp.status} ${resp.statusText}`);
    return endSSE(res);
  }

  const decoder = new TextDecoder();
  let buffer = '';
  let emitted = 0;

  for await (const chunk of resp.body){
    buffer += decoder.decode(chunk, {stream:true});
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts){
      if (!part.startsWith('data:')) continue;
      const jsonStr = part.replace(/^data:\s*/, '');
      if (jsonStr === '[DONE]') { endSSE(res); return; }
      try{
        const obj = JSON.parse(jsonStr);
        const choice = obj?.choices?.[0];
        const d = choice?.delta;

        // Tik tekstas – vengiam "[object Object]"
        if (typeof d?.content === 'string' && d.content){
          writeDelta(res, d.content);
          emitted++;
        } else if (typeof d === 'string' && d){
          // kai kurie tiekėjai kartais siunčia kaip string
          writeDelta(res, d);
          emitted++;
        } else {
          // ignoruojam role/tool_calls/finish_reason ir pan.
        }
      }catch{}
    }
  }

  if (!emitted) writeDelta(res, '⚠️ Tuščias srautas.');
  endSSE(res);
}

/** Anthropic (Claude) – atskiras SSE formatas */
async function streamAnthropic({ apiKey, model, userText }, res){
  const url = 'https://api.anthropic.com/v1/messages';
  const body = { model, max_tokens: 1024, stream: true, messages: [{ role:'user', content:userText||'' }] };

  const resp = await fetch(url, {
    method:'POST',
    headers:{
      'x-api-key': apiKey,
      'anthropic-version':'2023-06-01',
      'content-type':'application/json'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok || !resp.body){
    writeDelta(res, `⚠️ ${model}: ${resp.status} ${resp.statusText}`);
    return endSSE(res);
  }

  const decoder = new TextDecoder();
  let buffer=''; let emitted=0;

  for await (const chunk of resp.body){
    buffer += decoder.decode(chunk, {stream:true});
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';
    for (const evt of events){
      const lines = evt.split('\n');
      let name=''; let data='';
      for (const ln of lines){
        if (ln.startsWith('event:')) name = ln.slice(6).trim();
        else if (ln.startsWith('data:')) data = ln.slice(5).trim();
      }
      if (!data) continue;
      if (data === '[DONE]'){ endSSE(res); return; }
      try{
        const obj = JSON.parse(data);
        if (name === 'content_block_delta' && obj?.delta?.type === 'text_delta' && obj.delta.text){
          writeDelta(res, obj.delta.text);
          emitted++;
        }
      }catch{}
    }
  }

  if (!emitted) writeDelta(res, '⚠️ Tuščias srautas.');
  endSSE(res);
}

/** Google Gemini – stream + fallback, jei nieko negaunam */
async function streamGemini({ apiKey, model, userText }, res){
  const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [{ role:'user', parts:[{ text:userText||'' }] }],
    generationConfig: { temperature: 0.7 }
  };

  const resp = await fetch(streamUrl, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });

  if (!resp.ok || !resp.body){
    writeDelta(res, `⚠️ ${model}: ${resp.status} ${resp.statusText}`);
    return endSSE(res);
  }

  const decoder = new TextDecoder();
  let buffer=''; let emitted=0;

  for await (const chunk of resp.body){
    buffer += decoder.decode(chunk, {stream:true});
    const parts = buffer.split('\n\n');
    buffer = parts.pop() || '';
    for (const part of parts){
      if (!part.startsWith('data:')) continue;
      const jsonStr = part.replace(/^data:\s*/, '');
      if (jsonStr === '[DONE]'){ 
        if (!emitted) { // fallback – non-stream vienkartinis
          try{
            const oneUrl = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
            const r = await fetch(oneUrl, { method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(body) });
            const j = await r.json();
            const txt = j?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('') || '';
            writeDelta(res, txt || '⚠️ Gemini grąžino tuščią atsakymą.');
          }catch(e){
            writeDelta(res, `⚠️ Gemini fallback klaida: ${e?.message||e}`);
          }
        }
        endSSE(res); 
        return; 
      }
      try{
        const obj = JSON.parse(jsonStr);
        // Streame gali būti arba "delta.text", arba pilni "content.parts"
        const t1 = obj?.candidates?.[0]?.delta?.text;
        const t2 = obj?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('');
        const text = t1 || t2 || '';
        if (text){ writeDelta(res, text); emitted++; }
      }catch{}
    }
  }

  if (!emitted) writeDelta(res, '⚠️ Tuščias srautas.');
  endSSE(res);
}

// ---- endpoint --------------------------------------------------------------

module.exports = async (req, res) => {
  sseHeaders(res);
  const body = await getBody(req);
  const q = req.query || {};

  const message = (body?.message ?? q.message ?? '').toString();
  const model   = (body?.model   ?? q.model   ?? 'gpt-4o-mini').toString();
  const imageUrl = (body?.image_url ?? q.image_url ?? '').toString();

  // Debug echo: /api/stream?message=Labas&echo=1
  if (q.echo === '1' || body?.echo === 1){
    const chunks = [`Pradžia: ${message||'Labas'}`, '…dirbam…', '…be tiekėjų…', 'Baigiam.'];
    let i=0; const t=setInterval(()=>{ if(i<chunks.length) writeDelta(res,chunks[i++]); else{clearInterval(t); endSSE(res);} },500);
    req.on('close', ()=>{ clearInterval(t); try{res.end();}catch(_){ } });
    return;
  }

  try{
    // OpenAI
    if (model === 'gpt-4o-mini'){
      await streamOpenAILike({
        url:'https://api.openai.com/v1/chat/completions',
        apiKey: process.env.OPENAI_API_KEY,
        model, userText: message, imageUrl
      }, res); return;
    }

    // DeepSeek
    if (model === 'deepseek-chat'){
      await streamOpenAILike({
        url:'https://api.deepseek.com/v1/chat/completions',
        apiKey: process.env.DEEPSEEK_API_KEY,
        model:'deepseek-chat', userText: message
      }, res); return;
    }

    // Grok (xAI) – palaikau Live Search jungiklį ?search=on|off|auto
    if (model === 'grok-4'){
      const mode = (q.search||body?.search||'auto').toString(); // 'auto' pagal nutyl.
      const extra = {};
      if (['on','off','auto'].includes(mode)) extra.search_parameters = { mode };
      await streamOpenAILike({
        url:'https://api.x.ai/v1/chat/completions',
        apiKey: process.env.XAI_API_KEY,
        model:'grok-4', userText: message, imageUrl, extraBody: extra
      }, res); return;
    }

    // Together (Llama)
    if (model === 'meta-llama/Llama-4-Scout-17B-16E-Instruct'){
      await streamOpenAILike({
        url:'https://api.together.xyz/v1/chat/completions',
        apiKey: process.env.TOGETHER_API_KEY,
        model, userText: message
      }, res); return;
    }

    // Anthropic (Claude) – modelis konfigūruojamas per env, jei tavo org dar neturi "claude-4-sonnet"
    if (model === 'claude-4-sonnet'){
      const anthropicModel = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
      await streamAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
        model: anthropicModel,
        userText: message
      }, res); return;
    }

    // Google (Gemini)
    if (model === 'gemini-2.5-flash'){
      const geminiModel = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      await streamGemini({
        apiKey: process.env.GOOGLE_API_KEY,
        model: geminiModel,
        userText: message
      }, res); return;
    }

    writeDelta(res, `⚠️ Neatpažintas modelis: ${model}`); endSSE(res);
  }catch(e){
    writeDelta(res, `⚠️ Klaida: ${e?.message||e}`); endSSE(res);
  }
};
