/* =======================================================================
   Paule – Premium Chat Orchestrator • v2.0.1
   - „Pirmas atsakęs laimi“
   - SSE gyvas srautas + JSON „typing“ imitacija
   - Follow-up chip'ai
   - Teisėjas / Ginčas / Kompromisas
   ======================================================================= */
(function () {
  'use strict';

  // --- Konfigai ---
  const CFG = (window.PAULE_CONFIG||{});
  const API_BASE = (CFG.restBase || '/api').replace(/\/+$/,'');
  const SSE_URL  = (CFG.restStreamSSE || CFG.restStream || (API_BASE+'/stream')).replace(/\/+$/,'');
  const COMPLETE_URL = API_BASE + '/complete';
  const MODELS_URL = (CFG.routes && CFG.routes.models) || (API_BASE + '/models');
  const SUGGEST_URL = API_BASE + '/suggest';

  const SOFT_TIMEOUT_MS = 1200;         // po kiek startuojam JSON fallback
  const HARD_DEADLINE_MS = 12000;       // absoliutus limitas vienam ratui
  const TYPE_MIN_DELAY = 8, TYPE_MAX_DELAY = 16;
  const SENTENCE_PAUSE_MIN = 120, SENTENCE_PAUSE_MAX = 220;
  const ICONS_BASE = (CFG.iconsBase || '/assets/icon');

  // --- Bendra būsena ---
  const state = {
    theme: getInitialTheme(),
    selectedModels: ['auto'],
    isStreaming:false,
    chatId:null,
    lastUserText:'',
    lastRound:{},                 // backId -> full text
    hasMessagesStarted:false,
    stickToBottom:true,
    decisionBarShown:false,
    primaryChosen:false,
    controllers:[],               // AbortController sąrašas
    modelPanels:{},               // frontId -> {element, content, completed, model(front)}
    boundPanels:{},               // backId -> frontId
  };

  // --- DOM ---
  const el = {
    modelList: document.getElementById('modelList'),
    chatArea: document.getElementById('chatArea'),
    decisionBar: document.getElementById('decisionBar'),
    welcome: document.getElementById('welcome'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    sidebar: document.getElementById('sidebar'),
    btnMobile: document.getElementById('btnMobile'),
    btnNewChat: document.getElementById('btnNewChat'),
    mobileOverlay: document.getElementById('mobileOverlay'),
    bottomSection: document.getElementById('bottomSection'),
    songsFeed: document.getElementById('songsFeed'),
    photosFeed: document.getElementById('photosFeed'),
    videosFeed: document.getElementById('videosFeed'),
  };

  // --- Bootstrap ---
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  async function init(){
    try{
      applyTheme(); bindEvents(); setInitialModelSelection(); updateBottomDock(); attachChatScroll();
      if (el.chatArea) el.chatArea.querySelectorAll('.message,.thinking')?.forEach(n=>n.remove());
      startFeedsAutoRefresh();

      // jeigu models.js turi ensureCapabilities – kviečiam; jei ne – tęsiam
      try {
        if (window.PAULE_MODELS && typeof window.PAULE_MODELS.ensureCapabilities === 'function') {
          await window.PAULE_MODELS.ensureCapabilities();
        }
      } catch(_){/* tylim */}

      log('🚀 Paule Orchestrator įkeltas.');
    }catch(e){ console.error('[PAULE]init', e); toast('Inicializacijos klaida', e.message); }
  }

  // --- Tema ---
  function getInitialTheme(){
    try{ const s=localStorage.getItem('paule_theme'); if (s&&s!=='auto') return s; }catch(_){}
    const h=new Date().getHours(); return (h>=20||h<7)?'dark':'light';
  }
  function applyTheme(){ document.documentElement.setAttribute('data-theme', state.theme); }

  // --- Įvykiai ---
  function bindEvents(){
    el.modelList?.addEventListener('click', onModelClick);
    el.sendBtn?.addEventListener('click', sendMessage);
    el.messageInput?.addEventListener('keydown', e=>{
      if (e.key==='Enter' && !e.shiftKey){ e.preventDefault(); sendMessage(); }
    });
    el.messageInput?.addEventListener('input', autoGrow);
    el.btnMobile?.addEventListener('click', ()=> el.sidebar?.classList.toggle('open'));
    el.mobileOverlay?.addEventListener('click', ()=> el.sidebar?.classList.remove('open'));
    el.btnNewChat?.addEventListener('click', ()=>location.reload());

    el.decisionBar?.addEventListener('click', e=>{
      const chip = e.target.closest('.decision-chip'); if (!chip) return;
      const mode = chip.getAttribute('data-mode');
      el.decisionBar.classList.add('boom'); setTimeout(()=>el.decisionBar.classList.remove('boom'), 280);
      if (mode==='debate') startDebate();
      else if (mode==='compromise') startCompromise();
      else if (mode==='judge') startJudge();
    });

    window.addEventListener('resize', updateBottomDock);
  }

  // --- Modelių pasirinkimas ---
  function onModelClick(e){
    const pill = e.target.closest('.model-pill'); if (!pill) return;
    let id = (pill.getAttribute('data-model')||'').toLowerCase().trim();
    if (id==='paule' || id==='augam-auto') id='auto';

    if (id==='auto'){
      el.modelList.querySelectorAll('.model-pill').forEach(p=>p.classList.remove('active'));
      pill.classList.add('active');
      state.selectedModels=['auto']; return;
    }
    el.modelList.querySelector('.model-pill[data-model="auto"]')?.classList.remove('active');
    pill.classList.toggle('active');
    const act = [...el.modelList.querySelectorAll('.model-pill.active')]
      .map(p=> (p.getAttribute('data-model')||'').toLowerCase().trim())
      .map(s=> (s==='paule'||s==='augam-auto') ? 'auto' : s)
      .filter(Boolean).filter(x=>x!=='auto');
    state.selectedModels = act.length ? act : ['auto'];
  }
  function getActiveFront(){ return (state.selectedModels.length? state.selectedModels.slice() : ['auto']); }
  function setInitialModelSelection(){
    el.modelList?.querySelectorAll('.model-pill').forEach(p=>p.classList.remove('active'));
    el.modelList?.querySelector('.model-pill[data-model="auto"]')?.classList.add('active');
  }

  // --- Siuntimas ---
  async function sendMessage(){
    const text = (el.messageInput?.value || '').trim(); if (!text) return;
    stopAll();

    state.lastUserText = text;
    if (!state.hasMessagesStarted){ state.hasMessagesStarted = true; updateBottomDock(); }
    hideWelcome();
    addUserBubble(text);
    el.messageInput.value=''; autoGrow();

    const front = getActiveFront();
    preallocatePanels(front);

    try{
      await runOrchestrator(text, front);
    }catch(e){
      toast('Klaida siunčiant žinutę', e?.message||String(e));
      finishWithErrors();
    }
  }

  function stopAll(){
    state.controllers.forEach(c=>{ try{c.abort();}catch(_){ } });
    state.controllers.length = 0;
    state.isStreaming = false; state.primaryChosen=false;
    el.sendBtn && (el.sendBtn.disabled=false);
  }

  function hideWelcome(){ if (!el.welcome) return; el.welcome.style.display='none'; }
  function autoGrow(){
    const i = el.messageInput; if (!i) return;
    i.style.height='auto';
    const max = Math.floor(window.innerHeight * 0.40);
    i.style.height = Math.min(i.scrollHeight, max)+'px';
  }

  // --- UI burbulai ---
  const MODEL_ICON = {
    chatgpt:`${ICONS_BASE}/chatgpt.svg`, claude:`${ICONS_BASE}/claude-seeklogo.svg`,
    gemini:`${ICONS_BASE}/gemini.svg`,  grok:`${ICONS_BASE}/xAI.svg`,
    deepseek:`${ICONS_BASE}/deepseek.svg`, llama:`${ICONS_BASE}/llama.svg`,
    auto:`${ICONS_BASE}/ai.svg`, paule:`${ICONS_BASE}/ai.svg`, judge:`${ICONS_BASE}/legal-contract.svg`
  };
  const nameOf = (id)=> (window.PAULE_MODELS && window.PAULE_MODELS.nameOf) ? window.PAULE_MODELS.nameOf(id) : id;

  function addUserBubble(text){
    if (!el.chatArea) return;
    const n = document.createElement('div'); n.className='message user';
    n.innerHTML = `<div class="avatar"><img class="ui-icon" src="${ICONS_BASE}/user.svg" alt=""></div>
      <div class="bubble user"><div class="bubble-card">
        <div class="msg-content">${escapeHtml(text)}</div>
        <div class="msg-meta"><span>Jūs</span><span>${timeNow()}</span></div>
      </div></div>`;
    appendFade(n); scrollToBottomIfNeeded();
  }

  function addModelBubble(frontId, streaming=true, content=''){
    const label = (frontId==='judge'?'Teisėjas':nameOf(frontId));
    const parsed = streaming ? '' : parseMarkdown(content);
    const n = document.createElement('div'); n.className='message';
    n.innerHTML = `<div class="avatar"><img class="ui-icon" src="${iconOf(frontId)}" alt=""></div>
      <div class="bubble" data-model="${frontId}">
        <div class="bubble-card">
          <button class="copy-btn" title="Kopijuoti"
           onclick="(function(b){const t=b.closest('.bubble-card')?.querySelector('.msg-content')?.innerText||'';navigator.clipboard.writeText(t).catch(()=>{});b.classList.add('ok');setTimeout(()=>b.classList.remove('ok'),900)})(this)"
           style="position:absolute;right:8px;top:8px;font-size:12px;border:1px solid var(--border);background:var(--bg-primary);padding:4px 6px;border-radius:6px;cursor:pointer;opacity:.8">⧉</button>
          <div class="msg-content">${parsed}</div>
          <div class="msg-meta"><span>${label}</span><span>${timeNow()}</span>${streaming?'<span class="typing"><span></span><span></span><span></span></span>':''}</div>
        </div>
      </div>`;
    appendFade(n); scrollToBottomIfNeeded();
    return n.querySelector('.msg-content');
  }
  function iconOf(id){ return MODEL_ICON[id] || MODEL_ICON.auto; }

  function preallocatePanels(frontList){
    state.modelPanels = {}; state.boundPanels = {};
    frontList.forEach(fid=>{
      const cont = addModelBubble(fid, true);
      state.modelPanels[fid] = { element: cont, content: '', completed:false, model: fid };
    });
  }

  // --- Orchestrator („pirmas atsakęs laimi“) ---
  async function runOrchestrator(message, frontList){
    state.isStreaming=true; el.sendBtn && (el.sendBtn.disabled=true);
    const { splitTransports, getBackId, canonicalFrontId } = window.PAULE_MODELS || {
      splitTransports:(x)=>({stream:x||[],json:[]}),
      getBackId:(x)=>x, canonicalFrontId:(x)=>x
    };

    const parts = splitTransports(frontList||[]);
    const streamF = parts.stream || [];
    const jsonF   = parts.json   || [];
    const chatId = state.chatId || ('chat_'+Date.now()+'_'+Math.random().toString(36).slice(2));
    state.chatId = chatId; state.lastRound={}; state.primaryChosen=false;

    // susiejimai front<->back
    [...streamF, ...jsonF].forEach(fid=>{
      const back = getBackId(fid);
      state.boundPanels[fid]=fid; state.boundPanels[back]=fid;
    });

    const runners = [];

    // SSE – visi paraleliai
    streamF.forEach(fid=>{
      const back = getBackId(fid);
      runners.push( runSSE({ front:fid, back, message, chatId }) );
    });

    // Po soft timeout – jeigu niekas nepradėjo, paleidžiam JSON grupę
    const jsonRunner = () => runJSONOnce({ fronts:jsonF, message, chatId });
    if (jsonF.length){
      const gate = new Promise(resolve=> setTimeout(resolve, SOFT_TIMEOUT_MS));
      gate.then(()=>{ if (!state.primaryChosen) runners.push(jsonRunner()); });
    }

    const hardStop = new Promise((_,rej)=> setTimeout(()=>rej(new Error('timeout')), HARD_DEADLINE_MS));
    try{ await Promise.race([Promise.allSettled(runners), hardStop]); }catch(_){}

    state.isStreaming=false; el.sendBtn && (el.sendBtn.disabled=false);
    maybeShowDecisionBar();
  }

  // --- SSE runner ---
  function runSSE({ front, back, message, chatId }){
    return new Promise((resolve) => {
      const panel = state.modelPanels[front];
      if (!panel) return resolve();

      addThinking(panel.element, nameOf(front));

      const url = buildStreamUrl({ model: back, models: back, message, max_tokens:4096, chat_id:chatId, _t:Date.now() });
      const es = new EventSource(url);
      let gotAny=false, closed=false;

      const finalize = ()=>{
        if (closed) return;
        closed=true;
        try{ es.close(); }catch(_){}
        rmThinking(panel.element);
        resolve();
      };

      es.addEventListener('start', e=>{
        try{ const d = JSON.parse(e.data||'{}'); if (d?.chat_id) state.chatId=d.chat_id; }catch(_){}
      });

      es.addEventListener('delta', e=>{
        gotAny=true;
        if (!state.primaryChosen){ state.primaryChosen = true; }
        const txt = safeDelta(e.data);
        if (!txt) return;
        panel.content += txt;
        panel.element.innerHTML = parseMarkdown(panel.content);
        scrollToBottomIfNeeded();
      });

      es.addEventListener('error', e=>{
        // serveris siunčia `event: error` su JSON {message:"..."} – parodome
        let msg='';
        try{ const d=JSON.parse(e.data||'{}'); msg = d?.message||''; }catch(_){}
        if (!msg && !gotAny) msg = 'Modelio paslauga laikinai nepasiekiama.';
        showPanelError(panel.element, msg);
        finalize();
      });

      es.addEventListener('done', _=>{
        panel.completed=true;
        state.lastRound[back] = panel.content||'';
        if (state.primaryChosen && panel.content) injectFollowUps(panel.element, panel.content||'');
        finalize();
      });

      // Network klaida (EventSource onerror)
      es.onerror = function(){ if (!gotAny) showPanelError(panel.element, 'Ryšio klaida (SSE).'); finalize(); };
    });
  }

  // --- JSON once runner (grupė) + typing imitacija ---
  async function runJSONOnce({ fronts, message, chatId }){
    if (!fronts || !fronts.length) return;
    try{
      const backList = fronts.map(f=> (window.PAULE_MODELS?window.PAULE_MODELS.getBackId(f):f)).join(',');
      const res = await postJSON(COMPLETE_URL, { message, models: backList, chat_id: chatId, max_tokens:4096 });
      if (!res || !res.answers || !Array.isArray(res.answers)) throw new Error('Bad JSON');

      for (const ans of res.answers){
        const back = ans.model || '';
        const front = state.boundPanels[back] || (window.PAULE_MODELS?window.PAULE_MODELS.canonicalFrontId(back):fronts[0]);
        const panel = state.modelPanels[front];
        if (!panel) continue;
        rmThinking(panel.element);
        if (!state.primaryChosen) state.primaryChosen = true;
        await typeInto(panel, ans.text||'');
        panel.completed=true;
        state.lastRound[ back || (window.PAULE_MODELS?window.PAULE_MODELS.getBackId(front):front) ] = panel.content||'';
        if (state.primaryChosen) injectFollowUps(panel.element, panel.content||'');
      }
    }catch(e){
      // Fallback į /api/stream?mode=once (suderinamumas)
      try{
        const data = await postStreamOnceCompat({
          message, models: fronts.map(f=> (window.PAULE_MODELS?window.PAULE_MODELS.getBackId(f):f)).join(','), chat_id: chatId
        });
        (data.answers||[]).forEach(async (ans)=>{
          const back = ans.model || '';
          const front = state.boundPanels[back] || (window.PAULE_MODELS?window.PAULE_MODELS.canonicalFrontId(back):fronts[0]);
          const panel = state.modelPanels[front]; if (!panel) return;
          rmThinking(panel.element);
          if (!state.primaryChosen) state.primaryChosen = true;
          await typeInto(panel, ans.text||'');
          panel.completed=true;
          state.lastRound[ back || (window.PAULE_MODELS?window.PAULE_MODELS.getBackId(front):front) ] = panel.content||'';
          injectFollowUps(panel.element, panel.content||'');
        });
      }catch(_){
        // tyliai
      }
    }
  }

  // --- Follow-ups („gratis“ klausimai) ---
  async function injectFollowUps(containerEl, fullText){
    if (containerEl._hasFollowUps) return;
    containerEl._hasFollowUps = true;
    try{
      const q = state.lastUserText || '';
      const res = await postJSON(SUGGEST_URL, { message:q, answer:stripMd(fullText), count:5 });
      const items = Array.isArray(res?.suggestions) ? res.suggestions : [];
      if (!items.length) return;
      const holder = document.createElement('div');
      holder.className='followups';
      holder.style.marginTop='10px';
      holder.innerHTML = `<div style="opacity:.75;font-size:12px;margin-bottom:6px">Gal dar įdomu:</div>
        <div class="chips" style="display:flex;flex-wrap:wrap;gap:6px"></div>`;
      const wrap = holder.querySelector('.chips');
      items.forEach(s=>{
        const chip = document.createElement('button');
        chip.className='chip';
        chip.type='button';
        chip.textContent = s;
        chip.addEventListener('click', ()=>{
          el.messageInput.value = s;
          el.messageInput.focus();
        });
        wrap.appendChild(chip);
      });
      containerEl.parentElement?.appendChild(holder);
      scrollToBottomIfNeeded();
    }catch(_){}
  }

  // --- Pagalbiniai transporteriai ---
  function buildStreamUrl(qs){
    const base = SSE_URL.replace(/\/stream-sse$/,'/stream');
    const u = base + (base.includes('?')?'&':'?') + new URLSearchParams(qs).toString();
    return u;
  }

  async function postJSON(url, body){
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    if (!res.ok) throw new Error('HTTP '+res.status);
    return res.json();
  }

  async function postStreamOnceCompat({ message, models, chat_id }){
    const url = SSE_URL + (SSE_URL.includes('?')?'&':'?') + 'mode=once';
    const res = await fetch(url, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ message, models, chat_id, mode:'once' }) });
    if (!res.ok) throw new Error('HTTP '+res.status);
    return res.json();
  }

  // --- Typing imitacija JSON atsakymams ---
  function randomBetween(a,b){ return Math.floor(a + Math.random()*(b-a+1)); }
  function splitWordsPreserve(text){
    const parts = [];
    const tokens = String(text||'').split(/(\s+)/);
    for (let i=0;i<tokens.length;i++){ parts.push(tokens[i]); }
    return parts;
  }
  async function typeInto(panel, text){
    const parts = splitWordsPreserve(text);
    for (let i=0;i<parts.length;i++){
      const w = parts[i];
      panel.content += w;
      panel.element.innerHTML = parseMarkdown(panel.content);
      scrollToBottomIfNeeded();
      const isSentenceEnd = /[.!?…]$/.test(w);
      await sleep(isSentenceEnd ? randomBetween(SENTENCE_PAUSE_MIN,SENTENCE_PAUSE_MAX) : randomBetween(TYPE_MIN_DELAY, TYPE_MAX_DELAY));
    }
  }

  // --- UI helperiai ---
  function addThinking(container, modelName){
    if (!container) return;
    container.innerHTML = `<div class="thinking"><div class="loading-dots"><span></span><span></span><span></span></div>
      <span style="margin-left:12px;opacity:.7">${escapeHtml(modelName)} rašo…</span></div>`;
  }
  function rmThinking(container){
    if (!container) return;
    const t = container.querySelector('.thinking'); if (t){ t.style.opacity='0'; t.style.transition='opacity .25s'; setTimeout(()=>t.remove(), 240); }
  }
  function showPanelError(container, msg){
    if (!container) return;
    const text = escapeHtml(msg||'Klaida');
    const box = document.createElement('div');
    box.style.cssText = 'margin-top:8px;font-size:12px;padding:8px;border-radius:8px;background:var(--bg-danger,rgba(220,20,60,.08));border:1px solid var(--border-danger,rgba(220,20,60,.35));color:var(--fg-danger,#d22);';
    box.innerHTML = `⚠️ ${text}`;
    container.appendChild(box);
    scrollToBottomIfNeeded();
  }
  function appendFade(node){
    node.style.opacity='0'; node.style.transform='translateY(16px)';
    el.chatArea?.appendChild(node);
    requestAnimationFrame(()=>{ node.style.transition='all .25s ease'; node.style.opacity='1'; node.style.transform='translateY(0)'; });
  }
  function updateBottomDock(){
    if (!el.bottomSection) return;
    if (state.hasMessagesStarted){ el.bottomSection.classList.add('after-message'); }
    else { el.bottomSection.classList.remove('after-message'); }
  }
  function attachChatScroll(){
    if (!el.chatArea || el.chatArea._hook) return;
    el.chatArea._hook = true;
    el.chatArea.addEventListener('scroll', ()=>{
      state.stickToBottom = (el.chatArea.scrollTop + el.chatArea.clientHeight) >= (el.chatArea.scrollHeight - 100);
    });
  }
  function scrollToBottomIfNeeded(){ if (state.stickToBottom) el.chatArea?.scrollTo({ top: el.chatArea.scrollHeight }); }

  // --- Sprendimų juosta ---
  function maybeShowDecisionBar(){
    if (state.decisionBarShown) return;
    if (!el.decisionBar) return;
    const hasAny = Object.keys(state.lastRound||{}).length>0;
    if (hasAny){
      el.decisionBar.style.display='flex';
      state.decisionBarShown = true;
    }
  }

  // --- Ginčas/Teisėjas/Kompromisas ---
  function startDebate(){
    addSystemMessage('🔁 Pradedamas AI ginčas – kiekvienas modelis pateiks 3–5 argumentus.');
    const front = getActiveFront();
    const prompt = state.lastUserText ?
      `${state.lastUserText}\n\nREŽIMAS: GINČAS.\nInstrukcija: Pateik 3–5 stipriausius argumentus, kodėl tavo siūlomas atsakymas/planas yra geriausias. Struktūra: • Argumentas • Įrodymas • Rizika.` :
      'AI ginčas: pateik argumentus.';
    preallocatePanels(front);
    runOrchestrator(prompt, front);
  }

  function startCompromise(){
    const answers = Object.entries(state.lastRound||{}).map(([model,txt])=>`[${model}]: ${txt}`).join('\n\n');
    if (!answers){ toast('Trūksta atsakymų', 'Pirmiausia gauti bent vieną modelio atsakymą.'); return; }
    addSystemMessage('🤝 Kompromisas: suderiname modelių atsakymus į vieną planą.');
    const prompt = `Žemiau – keli skirtingų modelių atsakymai.\nSujunk į vieną realistišką sprendimą (žingsniai, rizikos, KPI, „next actions“).\n\n${answers}\n\nGrąžink: • Santrauka • Vieningas sprendimas • 3 KPI • Pirmi 5 žingsniai.`;
    preallocatePanels(['auto']);
    runOrchestrator(prompt, ['auto']);
  }

  function startJudge(){
    const answers = Object.entries(state.lastRound||{}).map(([model,txt])=>`[${model}]: ${txt}`).join('\n\n');
    if (!answers){ toast('Trūksta atsakymų', 'Pirmiausia gauti bent vieną modelio atsakymą.'); return; }
    addSystemMessage('⚖️ Teisėjas vertina atsakymus…');
    const judgeKey = 'judge';
    const cont = addModelBubble('judge', true);
    state.modelPanels = { [judgeKey]: { element: cont, content:'', completed:false, model:'judge' } };
    state.boundPanels = {};
    const prompt = `Tu esi „Teisėjas“.\nĮvertink pateiktus atsakymus ir parink geriausią.\nGrąžink: • Verdiktas • Kodėl • Kurio modelio idėja • 2 silpnybės kitų variantų • Finalus planas.\n\n${answers}`;
    runOrchestrator(prompt, ['llama']);
  }

  // --- Sistemos žinutė ---
  function addSystemMessage(text){
    if (!el.chatArea) return;
    const n = document.createElement('div'); n.className='message';
    n.innerHTML = `<div class="avatar"><img class="ui-icon" src="${ICONS_BASE}/ai.svg" alt=""></div>
      <div class="bubble" data-model="auto"><div class="bubble-card">
        <div class="msg-content">${parseMarkdown(text)}</div>
        <div class="msg-meta"><span>Paule</span><span>${timeNow()}</span></div>
      </div></div>`;
    appendFade(n); scrollToBottomIfNeeded();
  }

  // --- Feeds demo (palikta) ---
  function startFeedsAutoRefresh(){ refreshFeeds(); setInterval(refreshFeeds, 6000); }
  function refreshFeeds(){
    fetch(API_BASE + '/library/recent?limit=3').then(r=>r.json()).then(data=>{
      try{ fillFeed(el.songsFeed, data.songs, '/assets/hero/music.webp'); }catch(_){}
      try{ fillFeed(el.photosFeed, data.photos, '/assets/hero/photo.webp'); }catch(_){}
      try{ fillFeed(el.videosFeed, data.videos, '/assets/hero/video.webp'); }catch(_){}
    }).catch(_=>{});
  }
  function fillFeed(root, items, placeholder){
    if (!root || !Array.isArray(items)) return;
    root.innerHTML = items.slice(0,3).map(it=>{
      const img = it.cover || it.thumb || it.url || placeholder;
      const title = it.title || 'Failas';
      const href = it.link || '#';
      return `<a class="lib-card thumb" href="${href}"><img src="${img}" alt=""><span>${escapeHtml(title)}</span></a>`;
    }).join('');
  }

  // --- Markdown ---
  function stripMd(s){ return String(s||'').replace(/`{1,3}[\s\S]*?`{1,3}/g,'').replace(/[*_#>-]/g,''); }
  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function timeNow(){ return new Date().toLocaleTimeString('lt-LT',{hour:'2-digit',minute:'2-digit'}); }
  function escapeHtml(x){ const d=document.createElement('div'); d.textContent=(x==null?'':String(x)); return d.innerHTML; }
  function safeDelta(s){ try{ const o=JSON.parse(s||'{}'); return o.text||o.delta||o.content||''; }catch(_){ return ''; } }

  function parseMarkdown(input){
    let src = String(input||'');

    // 1) Escape HTML
    let t = escapeHtml(src);

    // 2) Apsaugom ```code blocks``` – įdedam placeholder'ius
    const CODE_STORE = [];
    t = t.replace(/```([\s\S]*?)```/g, (_,code)=>{
      const i = CODE_STORE.push(code)-1;
      return `@@CODEBLOCK_${i}@@`;
    });

    // 3) Inline `code`
    t = t.replace(/`([^`]+)`/g, (_,m)=> `<code style="background:var(--bg-code,rgba(0,0,0,.06));padding:2px 4px;border-radius:4px">${m}</code>`);

    // 4) Heading'ai # ## ###
    t = t.replace(/^###\s+(.+)$/gm, `<h3 style="margin:.4em 0 .2em;color:var(--accent,#5b7cff);font-weight:700">$1</h3>`);
    t = t.replace(/^##\s+(.+)$/gm,  `<h2 style="margin:.5em 0 .25em;color:var(--accent,#5b7cff);font-weight:800">$1</h2>`);
    t = t.replace(/^#\s+(.+)$/gm,   `<h1 style="margin:.6em 0 .3em;color:var(--accent,#5b7cff);font-weight:800;font-size:1.15em">$1</h1>`);

    // 5) Sąrašai: - item / * item
    t = t.replace(/(^|\n)(?:[-*]\s.+)(?:\n[-*]\s.+)*/g, (block)=>{
      const lines = block.trim().split('\n').map(l=> l.replace(/^[-*]\s+/,'').trim());
      return `\n<ul style="margin:.25em 0 .25em .9em; padding:0; list-style:disc inside;">` +
        lines.map(li=>`<li>${li}</li>`).join('') + `</ul>`;
    });

    // 6) Numeruoti sąrašai: 1. item
    t = t.replace(/(^|\n)(?:\d+[.)]\s.+)(?:\n\d+[.)]\s.+)*/g, (block)=>{
      const lines = block.trim().split('\n').map(l=> l.replace(/^\d+[.)]\s+/,'').trim());
      return `\n<ol style="margin:.25em 0 .25em 1.1em; padding:0; list-style:decimal inside;">` +
        lines.map(li=>`<li>${li}</li>`).join('') + `</ol>`;
    });

    // 7) **bold** su akcento spalva, *italic*
    t = t.replace(/\*\*([^*]+)\*\*/g, `<strong style="color:var(--accent,#5b7cff)">$1</strong>`);
    t = t.replace(/\*([^*]+)\*/g, `<em>$1</em>`);

    // 8) Dvigubi tarpai → <br> (po antraščių ir listų likusiam tekstui)
    t = t.replace(/\n/g, '<br>');

    // 9) Grąžinam code blocks
    t = t.replace(/@@CODEBLOCK_(\d+)@@/g, (_,i)=>{
      const code = CODE_STORE[Number(i)]||'';
      return `<pre style="background:var(--bg-code,rgba(0,0,0,.06));padding:10px;border-radius:10px;overflow:auto"><code>${code}</code></pre>`;
    });

    return t;
  }

  function toast(title, details){
    const n=document.createElement('div');
    n.className='error-notification';
    n.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(title)}</div>${
      details?`<div style="font-size:12px;opacity:.8">${escapeHtml(details)}</div>`:''}`;
    document.body.appendChild(n);
    setTimeout(()=>n.remove(), 6000);
  }
  function log(){ try{ console.log('[PAULE]', ...arguments); }catch(_){ } }

  // Expose viešai
  window.PauleMain = { state, sendMessage, startDebate, startCompromise, startJudge };

})();
