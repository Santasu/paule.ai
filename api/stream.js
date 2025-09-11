// /api/stream.js
export const config = { runtime: 'edge' };

import { jsonSSE, openaiDelta, eventSSE, badJSON, pickInt, isAnthropic, isXAI } from './_utils.js';

const enc = new TextEncoder();

export default async function handler(req) {
  const url = new URL(req.url);
  const model = url.searchParams.get('model') || '';
  const message = url.searchParams.get('message') || '';
  const maxTokens = pickInt(url.searchParams.get('max_tokens'), 1024);
  const thinking = url.searchParams.get('thinking'); // "1" to enable for Claude
  const search = url.searchParams.get('search');     // "on" | "auto"

  if (!message || !model) {
    return badJSON(400, 'model and message are required');
  }

  // Build a stream to the client
  const stream = new ReadableStream({
    async start(controller) {
      const write = (str) => controller.enqueue(enc.encode(str));
      const done  = () => controller.close();
      const fail  = (e) => { controller.enqueue(enc.encode(eventSSE('error', { message: String(e?.message || e) }))); controller.enqueue(enc.encode('data: [DONE]\n\n')); controller.close(); };

      try {
        if (isAnthropic(model)) {
          // === Anthropic (Claude Sonnet 4) ===
          const body = {
            model,
            max_tokens: maxTokens,
            messages: [{ role:'user', content: message }],
            stream: true
          };
          // Optional extended thinking
          if (thinking === '1' || thinking === 'true') {
            body.thinking = { budget_tokens: 2048 };
          }

          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'x-api-key':        process.env.ANTHROPIC_API_KEY || '',
              'anthropic-version':'2023-06-01'
            },
            body: JSON.stringify(body)
          });

          if (!resp.ok) {
            const errText = await resp.text().catch(()=>String(resp.status));
            write(eventSSE('error', { message:`Anthropic HTTP ${resp.status}: ${errText.slice(0,300)}` }));
            write('data: [DONE]\n\n'); return done();
          }

          if ((resp.headers.get('content-type')||'').includes('text/event-stream')) {
            // Parse Anthropic SSE -> normalize to OpenAI-style delta
            const reader = resp.body.getReader();
            const dec = new TextDecoder();
            let buf = '';
            for (;;) {
              const {done: d, value} = await reader.read(); if (d) break;
              buf += dec.decode(value, { stream:true });
              let idx;
              while ((idx = buf.indexOf('\n\n')) >= 0) {
                const frame = buf.slice(0, idx).trim(); buf = buf.slice(idx+2);
                if (!frame) continue;

                const evLine   = frame.split('\n').find(l=> l.startsWith('event:'));
                const dataLine = frame.split('\n').find(l=> l.startsWith('data:'));
                const ev = evLine ? evLine.replace(/^event:\s*/,'').trim() : 'message';
                const data = dataLine ? dataLine.replace(/^data:\s*/,'').trim() : '';

                if (data === '[DONE]') { write('data: [DONE]\n\n'); return done(); }

                if (ev === 'content_block_delta') {
                  try {
                    const j = JSON.parse(data);
                    const piece = j?.delta?.text || ''; // Anthropic text delta
                    if (piece) write(openaiDelta(piece));
                  } catch(_) {}
                } else if (ev === 'message_delta') {
                  // stop_reason etc. – just finish when arrives
                } else if (ev === 'error') {
                  write(eventSSE('error', { message: data }));
                }
              }
            }
            write('data: [DONE]\n\n'); return done();
          } else {
            // Fallback non-stream: get full text and emit once as SSE
            const j = await resp.json().catch(()=>null);
            const text = Array.isArray(j?.content) ? (j.content.find(b=>b.type==='text')?.text || '') : (j?.content?.[0]?.text || '');
            if (text) write(openaiDelta(text));
            write('data: [DONE]\n\n'); return done();
          }
        }

        if (isXAI(model)) {
          // === xAI Grok ===
          const body = {
            model,
            messages: [{ role:'user', content: message }],
            stream: true
          };

          // Live Search (optional)
          if (search === 'on' || search === 'auto' || search === '') {
            body.search_parameters = { mode: search || 'auto' };
          }

          const resp = await fetch('https://api.x.ai/v1/chat/completions', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'Authorization':`Bearer ${process.env.XAI_API_KEY || ''}`
            },
            body: JSON.stringify(body)
          });

          if (!resp.ok) {
            const errText = await resp.text().catch(()=>String(resp.status));
            write(eventSSE('error', { message:`Grok HTTP ${resp.status}: ${errText.slice(0,300)}` }));
            write('data: [DONE]\n\n'); return done();
          }

          // xAI jau grąžina OpenAI-stiliaus SSE – perskaitom ir normalizuojam (saugiai)
          const reader = resp.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const {done: d, value} = await reader.read(); if (d) break;
            buf += dec.decode(value, { stream:true });
            let idx;
            while ((idx = buf.indexOf('\n\n')) >= 0) {
              const frame = buf.slice(0, idx).trim(); buf = buf.slice(idx+2);
              if (!frame) continue;

              const dataLine = frame.split('\n').find(l=> l.startsWith('data:'));
              if (!dataLine) continue;
              const data = dataLine.replace(/^data:\s*/,'').trim();
              if (data === '[DONE]') { write('data: [DONE]\n\n'); return done(); }
              try{
                const j = JSON.parse(data);
                const piece = j?.choices?.[0]?.delta?.content ?? '';
                if (piece) write(openaiDelta(piece));
              }catch(_){}
            }
          }
          write('data: [DONE]\n\n'); return done();
        }

        // Neatpažintas modelis – pranešame klaidą kaip SSE įvykį, kad UI nesulūžtų
        write(eventSSE('error', { message:`Unsupported stream model: ${model}` }));
        write('data: [DONE]\n\n'); return done();

      } catch (err) {
        try{
          // paskutinė apsauga
          const msg = err?.message || String(err);
          controller.enqueue(enc.encode(eventSSE('error', { message: msg })));
          controller.enqueue(enc.encode('data: [DONE]\n\n'));
        }catch(_){}
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers:{
      'Content-Type':'text/event-stream; charset=utf-8',
      'Cache-Control':'no-store, no-transform',
      'X-Accel-Buffering':'no' // nginx/proxy hint
    }
  });
}
