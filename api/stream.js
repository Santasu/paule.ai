// filename: api/stream.js
export const config = { runtime: 'edge' };

/**
 * Vieningas SSE “hub’as”:
 * - OpenAI (gpt-5-mini)           → /v1/chat/completions (stream, max_completion_tokens)
 * - Anthropic (Claude)             → /v1/messages (stream, event: content_block_delta, thinking.type='enabled')
 * - Google Gemini                  → :streamGenerateContent (NDJSON → verčiam į mūsų SSE)
 * - xAI Grok                       → /v1/chat/completions (stream)
 * - DeepSeek                       → /chat/completions (stream)
 * - OpenRouter (Llama/Paule)       → /api/v1/chat/completions (stream)
 *      ↳ Fallback: Together        → /v1/chat/completions (stream), jei nėra OPENROUTER_API_KEY arba 401/403
 *
 * Visiems atgal grąžinam vienodą formatą:
 *   data: {"choices":[{"delta":{"content":"...chunk..."}}]}\n\n
 * Klaida:
 *   event: error
 *   data: {"message":"Žmogiška žinutė"}\n\n
 * Pabaiga:
 *   data: [DONE]\n\n
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

const hdrsSSE = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-store, no-transform',
  'X-Accel-Buffering': 'no',
  'Access-Control-Allow-Origin': '*'
};

const SSE = {
  delta: (t) => `data: ${JSON.stringify({ choices:[{ delta:{ content:String(t) } }] })}\n\n`,
  event: (name, payload) =>
    `event: ${name}\n${payload ? `data: ${JSON.stringify(payload)}\n` : ''}\n`,
  done:  () => `data: [DONE]\n\n`
};

// ——— Detektoriai ———
const isOpenAI     = (m='') => /^gpt-/i.test(m);
const isAnthropic  = (m='') => /^claude|sonnet/i.test(m);
const isGemini     = (m='') => /^(gemini[-\w]*|google\/)/i.test(m);
const isXAI        = (m='') => /grok/i.test(m);
const isDeepSeek   = (m='') => /deepseek/i.test(m);
const isOpenRouter = (m='') => /meta-llama|llama|openrouter\//i.test(m);

export default async function handler(req) {
  const url = new URL(req.url);
  const model   = (url.searchParams.get('model')   || '').trim();
  const message = (url.searchParams.get('message') || '').trim();
  const maxTok  = clampInt(url.searchParams.get('max_tokens'), 1, 32768, 4096);
  const search  = (url.searchParams.get('search')  || '').trim();         // 'on' | 'auto'
  const thinking= (url.searchParams.get('thinking')|| '').trim();         // '1'|'true' → Anthropic thinking
  const temperature = url.searchParams.get('temperature');
  const system  = url.searchParams.get('system');

  if (!model || !message) {
    return new Response(SSE.event('error', { message: 'Trūksta: model ir/ar message' }) + SSE.done(), { headers: hdrsSSE });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const write = (s) => controller.enqueue(enc.encode(s));
      const close = () => controller.close();
      const fail  = (e) => { try { write(SSE.event('error', { message: toMsg(e) })); write(SSE.done()); } finally { close(); } };

      try {
        // === Anthropic (Claude) ===
        if (isAnthropic(model)) {
          const body = {
            model, stream: true, max_tokens: maxTok,
            messages: [{ role: 'user', content: message }]
          };
          if (/^(1|true)$/i.test(thinking)) {
            body.thinking = { type: 'enabled', budget_tokens: 2048 };
          }
          const resp = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': (process.env.ANTHROPIC_API_KEY || ''),
              'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify(body)
          });
          if (!resp.ok) return fail(await friendlyHttp('Anthropic', resp));
          const reader = resp.body.getReader();
          let buf = '';
          for(;;){
            const {done, value} = await reader.read(); if (done) break;
            buf += dec.decode(value, { stream:true });
            let i;
            while((i = buf.indexOf('\n\n')) >= 0){
              const frame = buf.slice(0, i).trim(); buf = buf.slice(i+2);
              if (!frame) continue;
              const ev   = pickLine(frame, 'event:')?.replace(/^event:\s*/,'').trim() || 'message';
              const data = pickLine(frame, 'data:') ?.replace(/^data:\s*/,'').trim() || '';
              if (!data) continue;
              if (data === '[DONE]') { write(SSE.done()); return close(); }
              if (ev === 'error')    { write(SSE.event('error', { message: data })); continue; }
              if (ev === 'content_block_delta') {
                try{
                  const j = JSON.parse(data);
                  const piece = j?.delta?.text || '';
                  if (piece) write(SSE.delta(piece));
                }catch(_){}
              }
            }
          }
          write(SSE.done()); return close();
        }

        // === xAI (Grok) ===
        if (isXAI(model)) {
          const body = {
            model, stream: true,
            messages: [{ role:'user', content: message }]
          };
          if (search) body.search_parameters = { mode: search }; // 'on' | 'auto'
          const resp = await fetch('https://api.x.ai/v1/chat/completions', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'Authorization': `Bearer ${process.env.XAI_API_KEY || ''}`
            },
            body: JSON.stringify(body)
          });
          if (!resp.ok) return fail(await friendlyHttp('Grok', resp));
          await pipeOpenAIStyle(resp, write);
          write(SSE.done()); return close();
        }

        // === OpenAI (gpt-5-mini) ===
        if (isOpenAI(model)) {
          const resp = await fetch('https://api.openai.com/v1/chat/completions', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY || ''}`
            },
            body: JSON.stringify({
              model, stream: true,
              messages: [{ role:'user', content: message }],
              // svarbu: ne "max_tokens", o "max_completion_tokens"
              max_completion_tokens: maxTok
            })
          });
          if (!resp.ok) return fail(await friendlyHttp('OpenAI', resp));
          await pipeOpenAIStyle(resp, write);
          write(SSE.done()); return close();
        }

        // === DeepSeek ===
        if (isDeepSeek(model)) {
          const resp = await fetch('https://api.deepseek.com/chat/completions', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY || ''}`
            },
            body: JSON.stringify({
              model, stream: true,
              messages: [{ role:'user', content: message }],
              max_tokens: maxTok
            })
          });
          if (!resp.ok) return fail(await friendlyHttp('DeepSeek', resp));
          await pipeOpenAIStyle(resp, write);
          write(SSE.done()); return close();
        }

        // === OpenRouter (Llama/Paule) su fallback į Together ===
        if (isOpenRouter(model)) {
          const ok = !!(process.env.OPENROUTER_API_KEY || '');
          if (ok) {
            const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
              method:'POST',
              headers:{
                'Content-Type':'application/json',
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY || ''}`,
                'HTTP-Referer': (process.env.SITE_URL || 'https://paule.app'),
                'X-Title': 'Paule'
              },
              body: JSON.stringify({
                model, stream: true,
                messages: [{ role:'user', content: message }],
                max_tokens: maxTok
              })
            });
            if (resp.ok) {
              await pipeOpenAIStyle(resp, write);
              write(SSE.done()); return close();
            }
            // jei 401/403 – krentam į Together
            if (![401,403].includes(resp.status)) return fail(await friendlyHttp('OpenRouter', resp));
          }
          // Together fallback
          const tk = (process.env.TOGETHER_API_KEY || '').trim();
          if (!tk) return fail('Llama: trūksta OPENROUTER_API_KEY arba TOGETHER_API_KEY');
          const resp2 = await fetch('https://api.together.xyz/v1/chat/completions', {
            method:'POST',
            headers:{
              'Content-Type':'application/json',
              'Authorization': `Bearer ${tk}`
            },
            body: JSON.stringify({
              model, stream: true,
              messages: [{ role:'user', content: message }],
              max_tokens: maxTok
            })
          });
          if (!resp2.ok) return fail(await friendlyHttp('Together', resp2));
          await pipeGenericChoicesDelta(resp2, write); // Together ne visada 100% OpenAI, todėl imame “generic” parsinimą
          write(SSE.done()); return close();
        }

        // === Google Gemini (NDJSON → SSE) ===
        if (isGemini(model)) {
          const key = (process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '').trim();
          if (!key) return fail('Gemini: trūksta GOOGLE_API_KEY / GEMINI_API_KEY');
          const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?key=${key}`;
          const genCfg = { maxOutputTokens: maxTok };
          const body = {
            contents: [{ role:'user', parts:[{ text: message }]}],
            generationConfig: genCfg
          };
          if (system && String(system).trim()){
            body.systemInstruction = { parts: [{ text: String(system) }] };
          }
          if (search && (search === 'on' || search === 'auto')){
            body.tools = [{ googleSearch: {} }];
          }
          if (temperature != null && `${temperature}`.trim() !== ''){
            const t = Number(temperature); if (!Number.isNaN(t)) body.generationConfig.temperature = t;
          }

          const resp = await fetch(endpoint, { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify(body) });
          if (!resp.ok) return fail(await friendlyHttp('Gemini', resp));

          const reader = resp.body.getReader();
          let buf = '';
          for(;;){
            const {done, value} = await reader.read(); if (done) break;
            buf += dec.decode(value, { stream:true });
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
                    if (piece) write(SSE.delta(piece));
                  }
                }
              }catch(_){ /* skip */ }
            }
          }
          write(SSE.done()); return close();
        }

        // Nepažintas modelis
        write(SSE.event('error', { message:`Nepalaikomas modelis: ${model}` })); write(SSE.done()); return close();

      } catch (e) { fail(e); }
    }
  });

  return new Response(stream, { headers: hdrsSSE });
}

// ——— Pagalbinės ———
function clampInt(v, min, max, def){ const n = parseInt(v,10); if (!Number.isFinite(n)) return def; return Math.min(Math.max(n, min), max); }
function toMsg(e){ try{ return String(e?.message || e); }catch(_){ return 'Klaida'; } }
async function friendlyHttp(name, resp){
  const txt = await resp.text().catch(()=>`HTTP ${resp.status}`);
  return `${name} HTTP ${resp.status}: ${txt.slice(0,400)}`;
}
function pickLine(frame, prefix){
  return frame.split('\n').find(l => l.startsWith(prefix));
}

/** “OpenAI stiliaus” SSE: data: {choices:[{delta:{content}}]} + [DONE] */
async function pipeOpenAIStyle(resp, write){
  const reader = resp.body.getReader();
  let buf = '';
  for(;;){
    const {done, value} = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream:true });
    let i;
    while((i = buf.indexOf('\n\n')) >= 0){
      const frame = buf.slice(0, i).trim(); buf = buf.slice(i+2);
      if (!frame) continue;
      const dataLine = frame.split('\n').find(l => l.startsWith('data:'));
      if (!dataLine) continue;
      const data = dataLine.replace(/^data:\s*/,'').trim();
      if (data === '[DONE]') return;
      try{
        const j = JSON.parse(data);
        const piece = j?.choices?.[0]?.delta?.content || '';
        if (piece) write(SSE.delta(piece));
      }catch(_){}
    }
  }
}

/** Bendresnis parsinimas Together/kitų tiekėjų, kurie grąžina įvairius laukus */
async function pipeGenericChoicesDelta(resp, write){
  const reader = resp.body.getReader();
  let buf = '';
  for(;;){
    const {done, value} = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream:true });
    let i;
    while((i = buf.indexOf('\n\n')) >= 0){
      const frame = buf.slice(0, i).trim(); buf = buf.slice(i+2);
      if (!frame) continue;
      const dataLine = frame.split('\n').find(l => l.startsWith('data:'));
      if (!dataLine) continue;
      const data = dataLine.replace(/^data:\s*/,'').trim();
      if (data === '[DONE]') return;
      try{
        const j = JSON.parse(data);
        let piece =
          j?.choices?.[0]?.delta?.content ??
          j?.choices?.[0]?.message?.content ??
          j?.output_text ??
          j?.text ??
          '';
        if (piece) write(SSE.delta(piece));
      }catch(_){}
    }
  }
}
