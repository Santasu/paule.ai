<script>
/* ====== AI GLUE: saugus prisikabinimas prie esamo UI (be perrašymų) ====== */
(function(){
  if (window.__AI_GLUE_INSTALLED__) return; 
  window.__AI_GLUE_INSTALLED__ = true;

  const MODEL_PREFS = ['gpt-5-mini','gpt-4o-mini','gpt-4o'];

  async function askAIStream(message){
    // 1) bandome srautą su pirmu modeliu
    try {
      const model = MODEL_PREFS[0];
      const url = `/api/stream?model=${encodeURIComponent(model)}&message=${encodeURIComponent(message)}&chat_id=${Date.now()}&max_tokens=1024`;
      const res = await fetch(url, { headers: { Accept: 'text/event-stream' }});
      if (!res.ok || !res.body) throw new Error('no stream');

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', out = '';

      for(;;){
        const it = await reader.read();
        if (it.done) break;
        buf += dec.decode(it.value, {stream:true});
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0){
          const frame = buf.slice(0, i).trim(); 
          buf = buf.slice(i+2);
          if (!frame) continue;
          const line = frame.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          const payload = line.replace(/^data:\s*/,'').trim();
          if (payload === '[DONE]') break;
          try {
            const j = JSON.parse(payload);
            const piece = j?.choices?.[0]?.delta?.content || '';
            if (piece) out += piece;
          } catch(_){}
        }
      }
      if (out.trim()) return out;
      throw new Error('empty');
    } catch(_){
      // 2) fallback į /api/complete su kelių modelių sąrašu
      const r = await fetch('/api/complete', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ message, models: MODEL_PREFS.join(','), max_tokens: 1024 })
      });
      const j = await r.json().catch(()=>({}));
      const ok = (j.answers||[]).find(a => a && a.text && !a.error);
      return ok?.text || j.text || 'Nepavyko gauti atsakymo.';
    }
  }

  async function genFlux(prompt){
    const r = await fetch('/api/flux/create', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ prompt, width:1024, height:1024 })
    });
    const j = await r.json().catch(()=>({}));
    if (j?.image) return j.image;
    throw new Error(j?.error || 'FLUX klaida');
  }

  // Paimam tavo elementus, jei yra:
  const input   = document.querySelector('#messageInput, [data-ai-input]');
  const sendBtn = document.querySelector('#sendBtn, [data-ai-send]');
  const box     = document.querySelector('#chatMessages, [data-ai-messages]');

  function addMsg(html, who='ai'){
    if (typeof window.addChatMessage === 'function') {
      window.addChatMessage(html, who === 'user');
      return;
    }
    // Minimalus fallback jeigu nėra tavo addChatMessage()
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin:10px 0;padding:10px;border:1px solid #333;border-radius:8px;background:#111;color:#fff';
    wrap.innerHTML = `<div style="opacity:.7;margin-bottom:6px">${who==='user'?'👤':'🤖'}</div>${html}`;
    (box || document.body).appendChild(wrap);
    if (box) box.scrollTop = box.scrollHeight;
  }

  async function handleSend(){
    let msg = (input?.value || '').trim();
    if (!msg && !input) { msg = prompt('Klausimas AI:') || ''; }
    if (!msg) return;

    addMsg(msg, 'user');
    if (input){ input.value=''; input.style.height='auto'; }

    // Jeigu prašoma vaizdo – FLUX
    if (/foto|nuotrauk|paveiksl|image|flux/i.test(msg)) {
      try {
        const url = await genFlux(msg.replace(/^(foto|image|paveikslas)[: ]*/i,''));
        addMsg(`<img src="${url}" alt="AI image" style="max-width:100%;border-radius:12px">`, 'ai');
        return;
      } catch(e){ addMsg('⚠️ Vaizdo generavimo klaida: ' + (e?.message||e), 'ai'); return; }
    }

    try {
      const text = await askAIStream(msg);
      addMsg(text, 'ai');
    } catch(e){
      addMsg('⚠️ Klaida: ' + (e?.message||e), 'ai');
    }
  }

  // ——— Saugiai perimam mygtuką/Enter (neperrašant tavo funkcijų)
  if (sendBtn) {
    sendBtn.addEventListener('click', function(e){
      e.preventDefault(); e.stopImmediatePropagation();
      handleSend();
    }, { capture:true });
  }
  if (input) {
    input.addEventListener('keydown', function(e){
      if (e.key === 'Enter' && !e.shiftKey){
        e.preventDefault(); e.stopImmediatePropagation();
        handleSend();
      }
    }, { capture:true });
  }
  // Mini mygtukas, jei puslapyje nėra tavo chat UI
  if (!sendBtn && !input) {
    const btn = document.createElement('button');
    btn.textContent = '💬';
    btn.title = 'AI';
    btn.style.cssText = 'position:fixed;right:16px;bottom:16px;width:50px;height:50px;border:none;border-radius:50%;background:#4b7;color:#fff;font-size:20px;box-shadow:0 8px 26px rgba(0,0,0,.35);z-index:9999;cursor:pointer';
    btn.onclick = handleSend;
    document.body.appendChild(btn);
  }
})();
</script>
