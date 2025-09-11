// api/stream.js
export const config = { runtime: 'edge' };

const enc = new TextEncoder();
const dec = new TextDecoder();

const okHdrs = {
  'Content-Type':'text/event-stream; charset=utf-8',
  'Cache-Control':'no-store, no-transform',
  'X-Accel-Buffering':'no'
};

const sse = {
  delta: (t) => `data: ${JSON.stringify({choices:[{delta:{content:String(t)}}]})}\n\n`,
  json:  (o) => `data: ${JSON.stringify(o)}\n\n`,
  event: (name, payload) => `event: ${name}\n${payload?`data: ${JSON.stringify(payload)}\n`:''}\n`,
  done:  () => `data: [DONE]\n\n`
};

// Modelio "detektoriai"
const isAnthropic = m => /^claude|sonnet/i.test(m);
const isXAI       = m => /grok/i.test(m);
const isOpenAI    = m => /^gpt-/i.test(m); // gpt-5-mini
const isDeepSeek  = m => /deepseek/i.test(m);
const isOpenRouter= m => /meta-llama|llama|openrouter\//i.test(m);

export default async function handler(req) {
  const url = new URL(req.url);
  const model   = url.searchParams.get('model')   || '';
  const message = url.searchParams.get('message') || '';
  const maxTok  = Math.max(1, parseInt(url.searchParams.get('max_tokens')||'1024',10));
  const thinking= url.searchParams.get('thinking'); // '1' -> Claude thinking
  const search  = url.searchParams.get('search');   // 'auto' -> Grok Live Search

  if (!model || !message) {
    return new Response(sse.json({ok:false,message:'model and message required'}) + sse.done(), { headers: okHdrs });
  }

  const stream = new ReadableStream({
    async start(controller){
      const write = (chunk) => controller.enqueue(enc.encode(chunk));
      const close = () => controller.close();
      const fail  = (e) => { try{ write(sse.event('error', {message:String(e?.message||e)})); write(sse.done()); } finally { close(); } };

      try {
        // === Anthropic (Claude Sonnet 4) ===
        if (isAnthropic(model)) {
          const body = {
            model, max_tokens: maxTok, stream:true,
            messages: [{ role:'user', content: message }]
          };
          if (thinking==='1' || thinking==='true') body.thinking = { budget_tokens: 2048 };

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
            write(sse.event('error',{message:`Anthropic HTTP ${resp.status}: ${txt.slice(0,300)}`})); write(sse.done()); return close();
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

        // === xAI (Grok) ===
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
            write(sse.event('error',{message:`Grok HTTP ${resp.status}: ${txt.slice(0,300)}`})); write(sse.done()); return close();
          }
          const reader=resp.body.getReader(); let buf='';
          for(;;){
            const {done,value}=await reader.read(); if(done) break;
            buf+=dec.decode(value,{stream:true});
            let i; while((i=buf.indexOf('\n\n'))>=0){
              const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
              if(!frame) continue;
              const dataLine=frame.split('\n').find(l=>l.startsWith('data:'));
              if(!dataLine) continue;
              const data=dataLine.replace(/^data:\s*/,'').trim();
              if (data==='[DONE]'){ write(sse.done()); return close(); }
              try{ const j=JSON.parse(data); const piece=j?.choices?.[0]?.delta?.content||''; if(piece) write(sse.delta(piece)); }catch(_){}
            }
          }
          write(sse.done()); return close();
        }

        // === OpenAI (ChatGPT: gpt-5-mini) ===
        if (isOpenAI(model)) {
          const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'Authorization':`Bearer ${process.env.OPENAI_API_KEY||''}`
            },
            body: JSON.stringify({
              model, stream:true,
              messages:[{role:'user', content:message}],
              max_tokens:maxTok
            })
          });
          if (!resp.ok){
            const txt=await resp.text().catch(()=>String(resp.status));
            write(sse.event('error',{message:`OpenAI HTTP ${resp.status}: ${txt.slice(0,300)}`})); write(sse.done()); return close();
          }
          const reader=resp.body.getReader(); let buf='';
          for(;;){
            const {done,value}=await reader.read(); if(done) break;
            buf+=dec.decode(value,{stream:true});
            let i; while((i=buf.indexOf('\n\n'))>=0){
              const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
              if(!frame) continue;
              const dataLine=frame.split('\n').find(l=>l.startsWith('data:'));
              if(!dataLine) continue;
              const data=dataLine.replace(/^data:\s*/,'').trim();
              if (data==='[DONE]'){ write(sse.done()); return close(); }
              try{ const j=JSON.parse(data); const piece=j?.choices?.[0]?.delta?.content||''; if(piece) write(sse.delta(piece)); }catch(_){}
            }
          }
          write(sse.done()); return close();
        }

        // === DeepSeek ===
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
            write(sse.event('error',{message:`DeepSeek HTTP ${resp.status}: ${txt.slice(0,300)}`})); write(sse.done()); return close();
          }
          const reader=resp.body.getReader(); let buf='';
          for(;;){
            const {done,value}=await reader.read(); if(done) break;
            buf+=dec.decode(value,{stream:true});
            let i; while((i=buf.indexOf('\n\n'))>=0){
              const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
              if(!frame) continue;
              const dataLine=frame.split('\n').find(l=>l.startsWith('data:'));
              if(!dataLine) continue;
              const data=dataLine.replace(/^data:\s*/,'').trim();
              if (data==='[DONE]'){ write(sse.done()); return close(); }
              try{ const j=JSON.parse(data); const piece=j?.choices?.[0]?.delta?.content||''; if(piece) write(sse.delta(piece)); }catch(_){}
            }
          }
          write(sse.done()); return close();
        }

        // === OpenRouter (Llama/Paule) ===
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
            write(sse.event('error',{message:`OpenRouter HTTP ${resp.status}: ${txt.slice(0,300)}`})); write(sse.done()); return close();
          }
          const reader=resp.body.getReader(); let buf='';
          for(;;){
            const {done,value}=await reader.read(); if(done) break;
            buf+=dec.decode(value,{stream:true});
            let i; while((i=buf.indexOf('\n\n'))>=0){
              const frame=buf.slice(0,i).trim(); buf=buf.slice(i+2);
              if(!frame) continue;
              const dataLine=frame.split('\n').find(l=>l.startsWith('data:'));
              if(!dataLine) continue;
              const data=dataLine.replace(/^data:\s*/,'').trim();
              if (data==='[DONE]'){ write(sse.done()); return close(); }
              try{ const j=JSON.parse(data); const piece=j?.choices?.[0]?.delta?.content||''; if(piece) write(sse.delta(piece)); }catch(_){}
            }
          }
          write(sse.done()); return close();
        }

        // ——— jei nepataikėm į jokį — pranešam, bet nelaužom UI
        write(sse.event('error', {message:`Unsupported stream model: ${model}`})); write(sse.done()); close();

      } catch (e) { fail(e); }
    }
  });

  return new Response(stream, { headers: okHdrs });
}
