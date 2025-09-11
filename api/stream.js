// filename: api/stream.js
export const config = { runtime: 'edge' };

const enc = new TextEncoder();
const dec = new TextDecoder();

// ——— SSE helpers
const okHdrs = {
  'Content-Type':'text/event-stream; charset=utf-8',
  'Cache-Control':'no-store, no-transform',
  'X-Accel-Buffering':'no'
};
const sse = {
  delta: (t) => `data: ${JSON.stringify({choices:[{delta:{content:String(t)}}]})}\n\n`,
  json:  (o) => `data: ${JSON.stringify(o)}\n\n`,
  event: (name, payload) => `event: ${name}\n${payload?`data: ${JSON.stringify(payload)}\n`:''}\n\n`,
  done:  () => `data: [DONE]\n\n`
};

// ——— Model detektoriai (griežtesni už ankstesnius)
const isAnthropic  = (m='') => /^claude|sonnet/i.test(m);
const isXAI        = (m='') => /grok/i.test(m);
const isOpenAI     = (m='') => /^gpt-/i.test(m);
const isDeepSeek   = (m='') => /deepseek/i.test(m);
// svarbu: OpenRouter – tik kai ID prasideda openrouter/
const isOpenRouter = (m='') => /^openrouter\//i.test(m);
// Together – tipiniai Together modeliai (pvz. meta-llama/...)
const isTogether   = (m='') => /^meta-llama\//i.test(m);
const isGemini     = (m='') => /^(gemini[-\w]*|google\/)/i.test(m);

// ——— Util
function parseErrText(status, txt){ return `${status}: ${String(txt||'').slice(0,300)}`; }
function splitForStreaming(text=''){
  // pjaunam į sakinius arba po ~40–60 simbolių kad būtų „gyvas“ streamas
  const out=[]; const s=String(text);
  const parts = s.split(/(?<=[\.\!\?\…])\s+/);
  for (const p of parts){
    if (p.length <= 120) { out.push(p); continue; }
    for (let i=0;i<p.length;i+=80) out.push(p.slice(i, i+80));
  }
  return out.filter(Boolean);
}

export default async function handler(req) {
  const url = new URL(req.url);
  const model   = (url.searchParams.get('model')   || '').trim();
  const message = (url.searchParams.get('message') || '').trim();
  const maxTok  = Math.max(1, parseInt(url.searchParams.get('max_tokens')||'1024',10));
  const temperature = url.searchParams.get('temperature');
  const search  = (url.searchParams.get('search') || '').trim(); // 'auto' | 'on'
  const system  = url.searchParams.get('system');

  if (!model || !message) {
    return new Response(sse.json({ok:false,message:'model and message required'}) + sse.done(), { headers: okHdrs });
  }

  const stream = new ReadableStream({
    async start(controller){
      const write = (chunk) => controller.enqueue(enc.encode(chunk));
      const close = () => controller.close();
      const fail  = (e) => { try{ write(sse.event('error', {message:String(e?.message||e)})); write(sse.done()); } finally { close(); } };

      try {
        // ==== Anthropic (Claude) – natyvus SSE, be thinking ====
        if (isAnthropic(model)) {
          const body = {
            model, max_tokens: maxTok, stream:true,
            messages: [{ role:'user', content: message }]
            // nesiunčiam .thinking – kai kuriems modeliams neleidžiama
          };
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'x-api-key'        : (process.env.ANTHROPIC_API_KEY||''),
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(body)
          });
          if (!resp.ok){
            const txt=await resp.text().catch(()=>String(resp.status));
            write(sse.event('error',{message:`Anthropic HTTP ${parseErrText(resp.status, txt)}`})); write(sse.done()); return close();
          }
          const reader=resp.body.getReader(); let buf='';
          for(;;){
            const {done,value}=await reader.read(); if(done) break;
            buf+=dec.decode(value,{stream:true});
            let i; while((i=buf.indexOf('\n\n'))>=0){
              const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
              if(!frame) continue;
              const ev = frame.split('\n').find(l=>l.startsWith('event:'))?.replace(/^event:\s*/,'').trim() || 'message';
              const dataLine = frame.split('\n').find(l=>l.startsWith('data:'));
              const data = dataLine? dataLine.replace(/^data:\s*/,'').trim() : '';
              if (data==='[DONE]'){ write(sse.done()); return close(); }
              if (ev==='error'){ write(sse.event('error',{message:data})); continue; }
              if (ev==='content_block_delta'){
                try{ const j=JSON.parse(data); const piece=j?.delta?.text||''; if (piece) write(sse.delta(piece)); }catch(_){}
              }
            }
          }
          write(sse.done()); return close();
        }

        // ==== xAI (Grok) – natyvus SSE ====
        if (isXAI(model)) {
          const body = { model, stream:true, messages:[{role:'user', content:message}] };
          if (search) body.search_parameters = { mode: search || 'auto' };
          const resp = await fetch('https://api.x.ai/v1/chat/completions', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'Authorization':`Bearer ${process.env.XAI_API_KEY||''}`
            },
            body: JSON.stringify(body)
          });
          if (!resp.ok){
            const txt=await resp.text().catch(()=>String(resp.status));
            write(sse.event('error',{message:`Grok HTTP ${parseErrText(resp.status, txt)}`})); write(sse.done()); return close();
          }
          const reader=resp.body.getReader(); let buf='';
          for(;;){
            const {done,value}=await reader.read(); if(done) break;
            buf+=dec.decode(value,{stream:true});
            let i; while((i=buf.indexOf('\n\n'))>=0){
              const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
              if(!frame) continue;
              const dataLine=frame.split('\n').find(l=>l.startsWith('data:')); if(!dataLine) continue;
              const data=dataLine.replace(/^data:\s*/,'').trim();
              if (data==='[DONE]'){ write(sse.done()); return close(); }
              try{ const j=JSON.parse(data); const piece=j?.choices?.[0]?.delta?.content||''; if(piece) write(sse.delta(piece)); }catch(_){}
            }
          }
          write(sse.done()); return close();
        }

        // ==== OpenAI (ChatGPT) – be SSE į išorę; darom server-side SSE imitaciją ====
        if (isOpenAI(model)) {
          // responses API
          const body = {
            model,
            input: String(message),
            max_output_tokens: maxTok
          };
          const resp = await fetch('https://api.openai.com/v1/responses', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'Authorization':`Bearer ${process.env.OPENAI_API_KEY||''}`
            },
            body: JSON.stringify(body)
          });
          const j = await resp.json().catch(()=>null);
          if (!resp.ok){
            const msg = j?.error?.message || `OpenAI HTTP ${resp.status}`;
            write(sse.event('error',{message:msg})); write(sse.done()); return close();
          }
          const text = j?.output_text
                    || j?.choices?.[0]?.message?.content
                    || j?.data?.[0]?.content?.[0]?.text
                    || '';
          if (!text){ write(sse.event('error',{message:'OpenAI: tuščias atsakymas'})); write(sse.done()); return close(); }
          // imituojam streamą
          for (const chunk of splitForStreaming(text)) {
            write(sse.delta(chunk)); await new Promise(r=>setTimeout(r, 20));
          }
          write(sse.done()); return close();
        }

        // ==== DeepSeek – natyvus SSE ====
        if (isDeepSeek(model)) {
          const resp = await fetch('https://api.deepseek.com/chat/completions', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'Authorization':`Bearer ${process.env.DEEPSEEK_API_KEY||''}`
            },
            body: JSON.stringify({
              model, stream:true,
              messages:[{role:'user', content:message}],
              max_tokens:maxTok
            })
          });
          if (!resp.ok){
            const txt=await resp.text().catch(()=>String(resp.status));
            write(sse.event('error',{message:`DeepSeek HTTP ${parseErrText(resp.status, txt)}`})); write(sse.done()); return close();
          }
          const reader=resp.body.getReader(); let buf='';
          for(;;){
            const {done,value}=await reader.read(); if(done) break;
            buf+=dec.decode(value,{stream:true});
            let i; while((i=buf.indexOf('\n\n'))>=0){
              const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
              if(!frame) continue;
              const dataLine=frame.split('\n').find(l=>l.startsWith('data:')); if(!dataLine) continue;
              const data=dataLine.replace(/^data:\s*/,'').trim();
              if (data==='[DONE]'){ write(sse.done()); return close(); }
              try{ const j=JSON.parse(data); const piece=j?.choices?.[0]?.delta?.content||''; if(piece) write(sse.delta(piece)); }catch(_){}
            }
          }
          write(sse.done()); return close();
        }

        // ==== OpenRouter – natyvus SSE (tik kai model pradeda openrouter/) ====
        if (isOpenRouter(model)) {
          const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'Authorization':`Bearer ${process.env.OPENROUTER_API_KEY||''}`,
              'HTTP-Referer': (process.env.SITE_URL||'https://paule.app'),
              'X-Title': 'Paule'
            },
            body: JSON.stringify({
              model, stream:true,
              messages:[{role:'user', content:message}],
              max_tokens:maxTok
            })
          });
          if (!resp.ok){
            const txt=await resp.text().catch(()=>String(resp.status));
            write(sse.event('error',{message:`OpenRouter HTTP ${parseErrText(resp.status, txt)}`})); write(sse.done()); return close();
          }
          const reader=resp.body.getReader(); let buf='';
          for(;;){
            const {done,value}=await reader.read(); if(done) break;
            buf+=dec.decode(value,{stream:true});
            let i; while((i=buf.indexOf('\n\n'))>=0){
              const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
              if(!frame) continue;
              const dataLine=frame.split('\n').find(l=>l.startsWith('data:')); if(!dataLine) continue;
              const data=dataLine.replace(/^data:\s*/,'').trim();
              if (data==='[DONE]'){ write(sse.done()); return close(); }
              try{ const j=JSON.parse(data); const piece=j?.choices?.[0]?.delta?.content||''; if(piece) write(sse.delta(piece)); }catch(_){}
            }
          }
          write(sse.done()); return close();
        }

        // ==== Together – natyvus SSE (pvz. meta-llama/...) ====
        if (isTogether(model)) {
          const resp = await fetch('https://api.together.ai/v1/chat/completions', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'Authorization':`Bearer ${process.env.TOGETHER_API_KEY||''}`
            },
            body: JSON.stringify({
              model, stream:true,
              messages:[{role:'user', content:message}],
              max_tokens:maxTok
            })
          });
          if (!resp.ok){
            const txt=await resp.text().catch(()=>String(resp.status));
            write(sse.event('error',{message:`Together HTTP ${parseErrText(resp.status, txt)}`})); write(sse.done()); return close();
          }
          const reader=resp.body.getReader(); let buf='';
          for(;;){
            const {done,value}=await reader.read(); if(done) break;
            buf+=dec.decode(value,{stream:true});
            let i; while((i=buf.indexOf('\n\n'))>=0){
              const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
              if(!frame) continue;
              const dataLine=frame.split('\n').find(l=>l.startsWith('data:')); if(!dataLine) continue;
              const data=dataLine.replace(/^data:\s*/,'').trim();
              if (data==='[DONE]'){ write(sse.done()); return close(); }
              try{ const j=JSON.parse(data); const piece=j?.choices?.[0]?.delta?.content||''; if(piece) write(sse.delta(piece)); }catch(_){}
            }
          }
          write(sse.done()); return close();
        }

        // ==== Google Gemini – streamGenerateContent → paverčiam į SSE ====
        if (isGemini(model)) {
          const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
          if (!key){
            write(sse.event('error', {message:'Missing GOOGLE_API_KEY'}));
            write(sse.done()); return close();
          }
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?key=${key}`;

          const genCfg = { maxOutputTokens: maxTok };
          if (temperature!=null && temperature!=='') {
            const t = Number(temperature);
            if (!Number.isNaN(t)) genCfg.temperature = t;
          }
          const body = {
            contents: [{ role:'user', parts:[{ text: String(message) }]}],
            generationConfig: genCfg
          };
          if (system && String(system).trim()){
            body.systemInstruction = { parts: [{ text: String(system) }] };
          }
          if (search && (search==='on' || search==='auto')){
            body.tools = [{ googleSearch: {} }];
          }

          const resp = await fetch(endpoint, {
            method:'POST',
            headers:{ 'Content-Type':'application/json' },
            body: JSON.stringify(body)
          });
          if (!resp.ok) {
            const txt = await resp.text().catch(()=>String(resp.status));
            write(sse.event('error', {message:`Gemini HTTP ${parseErrText(resp.status, txt)}`})); write(sse.done()); return close();
          }

          const reader = resp.body.getReader();
          let buf = '';
          for(;;){
            const {done, value} = await reader.read(); if (done) break;
            buf += dec.decode(value, {stream:true});
            let idx;
            while ((idx = buf.indexOf('\n')) >= 0){
              const line = buf.slice(0, idx).trim();
              buf = buf.slice(idx + 1);
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
          write(sse.done()); return close();
        }

        // ——— Jei nepataikėm į jokį tiekėją
        write(sse.event('error', {message:`Unsupported model: ${model}`})); write(sse.done()); close();

      } catch (e) { fail(e); }
    }
  });

  return new Response(stream, { headers: okHdrs });
}
