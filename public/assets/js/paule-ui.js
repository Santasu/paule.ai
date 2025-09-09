/* =======================================================================
   Paule – Premium Chat Orchestrator • v2.3.0 (patvarkyta)
   - Lygiagretus startas (SSE + JSON po soft timeout)
   - „Pirmas pradėjęs rašyti“ → aukščiau (kortelė tik su 1-ąja delta)
   - Global "AI mąsto..." kol nėra jokio teksto
   - Follow-ups tik kai VISI baigė • Klaidos – APAČIOJE
   - Scroll-lock + „Į naujausią“ mygtukas • MD spalvos + bold glow
   ======================================================================= */
(function () {
  'use strict';

  // --- Konfigai ---
  const CFG = (window.PAULE_CONFIG||{});
  const API_BASE = (CFG.restBase || '/api').replace(/\/+$/,'');
  const SSE_URL  = (CFG.restStreamSSE || CFG.restStream || (API_BASE+'/stream')).replace(/\/+$/,'');
  const COMPLETE_URL = API_BASE + '/complete';
  const SUGGEST_URL = API_BASE + '/suggest';
  const ICONS_BASE = (CFG.iconsBase || '/assets/icon');

  // Tunables
  const SOFT_TIMEOUT_MS = 1000;   // po kiek startuojam JSON fallback (net jei SSE jau rašo)
  const HARD_DEADLINE_MS = 20000; // globalus „bail-out“
  const TYPE_MIN_DELAY = 8, TYPE_MAX_DELAY = 16;
  const SENTENCE_PAUSE_MIN = 120, SENTENCE_PAUSE_MAX = 220;

  // --- Bendra būsena ---
  const state = {
    theme: getInitialTheme(),
    selectedModels: ['auto'],
    isStreaming:false,
    chatId:null,
    lastUserText:'',
    hasMessagesStarted:false,
    stickToBottom:true,

    // round
    panels:{},          // frontId -> { el, content, done }
    startedOrder:[],    // frontIds pagal pirmą delta
    firstStarted:null,
    pending:0,          // kiek frontų dar laukiam (SSE korta + JSON korta)
    errors:[],          // {front, name, msg}
    hasAnyText:false,
    suggestShown:false,

    // legacy
    decisionBarShown:false,
    lastRound:{},       // backId -> text (naudojama ginčui/teisėjui/kt.)
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
    mobileOverlay: document.getElementById('mobileOverlay') || document.getElementById('drawerOverlay'),
    bottomSection: document.getElementById('bottomSection'),
    songsFeed: document.getElementById('songsFeed'),
    photosFeed: document.getElementById('photosFeed'),
    videosFeed: document.getElementById('videosFeed'),
    followSuggestBar: document.getElementById('followSuggestBar'),
  };

  // --- Bootstrap ---
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  async function init(){
    try{
      applyTheme(); bindEvents(); setInitialModelSelection(); updateBottomDock(); attachChatScroll();
      if (el.chatArea) el.chatArea.querySelectorAll('.message,.thinking,._ai-wait')?.forEach(n=>n.remove());
      startFeedsAutoRefresh();

      try {
        if (window.PAULE_MODELS && typeof window.PAULE_MODELS.ensureCapabilities === 'function') {
          await window.PAULE_MODELS.ensureCapabilities();
        }
      } catch(_){}

      log('🚀 Paule Orchestrator įkeltas.');
    }catch(e){ console.error('[PAULE]init]', e); toast('Inicializacijos klaida', e.message); }
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
    window.addEventListener('resize', updateBottomDock);

    el.decisionBar?.addEventListener('click', e=>{
      const chip = e.target.closest('.decision-chip'); if (!chip) return;
      const mode = chip.getAttribute('data-mode');
      el.decisionBar.classList.add('boom'); setTimeout(()=>el.decisionBar.classList.remove('boom'), 280);
      if (mode==='debate') startDebate();
      else if (mode==='compromise') startCompromise();
      else if (mode==='judge') startJudge();
    });
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

    resetRound();

    state.lastUserText = text;
    if (!state.hasMessagesStarted){ state.hasMessagesStarted = true; updateBottomDock(); }
    hideWelcome();
    addUserBubble(text);
    el.messageInput.value=''; autoGrow();

    const fronts = getActiveFront();
    try{
      await startOrchestrator(text, fronts);
    }catch(e){
      toast('Klaida siunčiant žinutę', e?.message||String(e));
      finalizeRound(); // vis tiek uždarysim
    }
  }

  function resetRound(){
    state.isStreaming = true;
    state.chatId = 'chat_'+Date.now()+'_'+Math.random().toString(36).slice(2);
    state.panels = {}; state.startedOrder = []; state.firstStarted = null;
    state.pending = 0; state.errors = []; state.hasAnyText=false; state.suggestShown=false;
    state.lastRound = {};
    el.followSuggestBar && (el.followSuggestBar.innerHTML='');
    showGlobalWait();
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
  function iconOf(id){ return MODEL_ICON[id] || MODEL_ICON.auto; }

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

  function ensurePanel(frontId){
    if (state.panels[frontId]) return state.panels[frontId];
    const n = document.createElement('div'); n.className='message';
    n.innerHTML = `<div class="avatar"><img class="ui-icon" src="${iconOf(frontId)}" alt=""></div>
      <div class="bubble" data-model="${frontId}">
        <div class="bubble-card">
          <button class="copy-btn" title="Kopijuoti"
           onclick="(function(b){const t=b.closest('.bubble-card')?.querySelector('.msg-content')?.innerText||'';navigator.clipboard.writeText(t).catch(()=>{});b.classList.add('ok');setTimeout(()=>b.classList.remove('ok'),900)})(this)"
           style="position:absolute;right:8px;top:8px;font-size:12px;border:1px solid var(--border);background:var(--bg-primary);padding:4px 6px;border-radius:6px;cursor:pointer;opacity:.8">⧉</button>
          <div class="msg-content"></div>
          <div class="msg-meta"><span>${escapeHtml(nameOf(frontId))}</span><span>${timeNow()}</span></div>
        </div>
      </div>`;
    appendFade(n);
    const contentEl = n.querySelector('.msg-content');
    const panel = { el: contentEl, content:'', done:false };
    state.panels[frontId]=panel;
    state.startedOrder.push(frontId);
    return panel;
  }

  // --- Orchestrator ---
  async function startOrchestrator(message, frontList){
    const { splitTransports, getBackId } = window.PAULE_MODELS || {
      splitTransports:(x)=>({stream:x||[],json:[]}),
      getBackId:(x)=>x
    };
    const parts   = splitTransports(frontList||[]);
    const streamF = parts.stream || [];
    const jsonF   = parts.json   || [];

    // kiek lauksim (viena „skola“ per frontą)
    state.pending = (streamF.length) + (jsonF.length);

    // Paleidžiam SSE visiems „stream“ frontams
    streamF.forEach(front=>{
      const back = getBackId(front);
      runSSE({ front, back, message, chatId: state.chatId })
        .catch(()=>{}).finally(()=>decPending());
    });

    // Po soft timeout – paleidžiam JSON once grupei (net jei SSE jau rašo)
    if (jsonF.length){
      setTimeout(()=>{
        runJSONOnce({ fronts: jsonF, message, chatId: state.chatId })
          .catch(()=>{}).finally(()=>{/* kiekvienam fronte decPending daromas pačiame runJSONOnce */});
      }, SOFT_TIMEOUT_MS);
    }

    // Kietas deadline – jeigu kas „pakibo“
    setTimeout(()=>{ finishIfHanging(); }, HARD_DEADLINE_MS);
  }

  function finishIfHanging(){
    if (!state.isStreaming) return;
    state.isStreaming=false;
    hideGlobalWait();
    finalizeRound();
  }

  // --- SSE runner ---
  function runSSE({ front, back, message, chatId }){
    return new Promise((resolve) => {
      const url = buildStreamUrl({ model: back, models: back, message, max_tokens:4096, chat_id:chatId, _t:Date.now() });
      const es = new EventSource(url);
      let gotAny=false, closed=false;

      const finalize = ()=>{
        if (closed) return; closed=true;
        try{ es.close(); }catch(_){}
        resolve();
      };

      // kai kuriuose backend’uose nėra custom „start/done“ – tik onmessage
      es.addEventListener('start', e=>{
        try{ const d = JSON.parse(e.data||'{}'); if (d?.chat_id) state.chatId=d.chat_id; }catch(_){}
      });

      const handleDelta = (payload)=>{
        if (payload === '[DONE]'){ // apsidraudimui
          const panel = state.panels[front]; if (panel) panel.done = true;
          state.lastRound[back] = (panel?.content||'');
          finalize(); return;
        }
        const piece = safeDelta(payload); if (!piece) return;
        if (!gotAny){
          gotAny=true; state.hasAnyText=true; hideGlobalWait();
          if (!state.firstStarted) state.firstStarted = front;
        }
        const panel = ensurePanel(front);
        panel.content += piece;
        panel.el.innerHTML = parseMarkdown(panel.content);
        scrollToBottomIfNeeded();
      };

      es.addEventListener('delta', e=> handleDelta(e.data||''));
      es.addEventListener('message', e=> handleDelta(e.data||'')); // jei nesiunčiam „event: delta“
      es.onmessage = (e)=> handleDelta(e.data||'');                 // universali atsarga

      es.addEventListener('error', e=>{
        const msg = parseErr(e) || 'Modelio paslauga laikinai nepasiekiama.';
        state.errors.push({ front, name: nameOf(front), msg });
        finalize();
      });

      es.addEventListener('done', _=>{
        const panel = state.panels[front];
        if (panel) panel.done = true;
        state.lastRound[back] = (panel?.content||'');
        finalize();
      });

      es.onerror = function(){
        if (!gotAny){
          state.errors.push({ front, name: nameOf(front), msg: 'Ryšio klaida (SSE).' });
        }
        finalize();
      };
    });
  }

  // --- JSON once runner (grupė) + typing imitacija ---
  async function runJSONOnce({ fronts, message, chatId }){
    if (!fronts || !fronts.length) return;
    const backIds = fronts.map(f=> (window.PAULE_MODELS?window.PAULE_MODELS.getBackId(f):f)).join(',');
    try{
      const res = await postJSON(COMPLETE_URL, { message, models: backIds, chat_id: chatId, max_tokens:4096 });
      const answers = Array.isArray(res?.answers) ? res.answers : [];
      const mappedFronts = new Set();

      for (const ans of answers){
        const back = ans.model||'';
        const front = (window.PAULE_MODELS && window.PAULE_MODELS.BACK_TO_FRONT && window.PAULE_MODELS.BACK_TO_FRONT[back]) || fronts[0];
        mappedFronts.add(front);

        const panel = ensurePanel(front);
        if (!state.hasAnyText){ state.hasAnyText=true; hideGlobalWait(); if (!state.firstStarted) state.firstStarted = front; }
        await typeInto(panel, ans.text||'');
        panel.done = true;
        state.lastRound[ back || (window.PAULE_MODELS?window.PAULE_MODELS.getBackId(front):front) ] = panel.content||'';
        decPending(); // viena front „skola“ sumažėjo
      }

      // jeigu kai kuriems frontams negrįžo atsakymas – pažymim klaidą, kad neužstrigtų pending
      fronts.forEach(f=>{
        if (!mappedFronts.has(f)){
          state.errors.push({ front:f, name:nameOf(f), msg:'Nepavyko gauti atsakymo (JSON fallback).' });
          decPending();
        }
      });

    }catch(e){
      // visiems JSON frontams pažymim klaidą ir mažinam pending
      fronts.forEach(f=>{
        state.errors.push({ front:f, name:nameOf(f), msg:'Nepavyko gauti atsakymo (JSON fallback).' });
        decPending();
      });
    }
  }

  // --- Pending / finalizacija ---
  function decPending(){
    state.pending = Math.max(0, state.pending - 1);
    if (state.pending === 0){
      state.isStreaming=false;
      hideGlobalWait();
      finalizeRound();
    }
  }

  function finalizeRound(){
    // 1) Klaidos – apačioje
    if (state.errors.length){
      const wrap = document.createElement('div');
      wrap.className='errors-wrap';
      state.errors.forEach(er=>{
        const n = document.createElement('div');
        n.className='message error';
        n.innerHTML = `<div class="avatar"><img class="ui-icon" src="${iconOf(er.front)}" alt=""></div>
          <div class="bubble"><div class="bubble-card error-card">
            <div class="msg-content"><strong>${escapeHtml(er.name)}</strong> – atsakymo nepavyko gauti.<br><span class="dim">${escapeHtml(er.msg||'Klaida')}</span></div>
            <div class="msg-meta"><span>${escapeHtml(er.name)}</span><span>${timeNow()}</span></div>
          </div></div>`;
        wrap.appendChild(n);
      });
      appendFade(wrap);
      scrollToBottomIfNeeded();
    }

    // 2) Follow-ups – tik kartą, kai VISI baigė
    if (!state.suggestShown){
      state.suggestShown = true;
      showFollowUps();
    }

    // 3) Sprendimų juosta (jei yra)
    maybeShowDecisionBar();
  }

  // --- Follow-ups (po VISŲ) ---
  async function showFollowUps(){
    try{
      const bestFront = state.firstStarted || Object.keys(state.panels)[0] || 'auto';
      const bestText = (state.panels[bestFront]?.content || '').slice(0, 4000);
      const payload = { message: state.lastUserText || '', answer: stripMd(bestText), count: 6 };
      const res = await postJSON(SUGGEST_URL, payload);
      const list = Array.isArray(res?.suggestions) ? res.suggestions : [];
      renderFollowBar(uniqueNonEmpty(list).slice(0,6));
    }catch(_){
      renderFollowBar(['Paaiškink detaliau','Duok pavyzdį','Sukurk veiksmų planą','Kokie pavojai?','Kokie KPI?','Alternatyvus sprendimas']);
    }
  }

  function renderFollowBar(items){
    if (!el.followSuggestBar) return;
    el.followSuggestBar.innerHTML='';
    if (!items || !items.length){ el.followSuggestBar.classList.remove('show'); return; }
    items.forEach(s=>{
      const b=document.createElement('div');
      b.className='suggest-chip';
      b.textContent=s;
      b.title=s;
      b.tabIndex=0;
      b.onclick=()=>{ el.messageInput.value=s; el.messageInput.focus(); };
      el.followSuggestBar.appendChild(b);
    });
    el.followSuggestBar.classList.add('show');
  }

  // --- Sprendimų juosta ---
  function maybeShowDecisionBar(){
    if (state.decisionBarShown) return;
    if (!el.decisionBar) return;
    const hasAny = Object.keys(state.panels||{}).length>0;
    if (hasAny){
      el.decisionBar.style.display='flex';
      state.decisionBarShown = true;
    }
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

  // --- Global wait ---
  function showGlobalWait(){
    if (document.querySelector('._ai-wait')) return;
    const w = document.createElement('div');
    w.className='_ai-wait';
    w.setAttribute('aria-live','polite');
    w.innerHTML = `<div class="_ai-wait-inner"><div class="dots"><span></span><span></span><span></span></div><div>AI mąsto, palaukite akimirką…</div></div>`;
    el.chatArea?.appendChild(w);
    scrollToBottomIfNeeded();
  }
  function hideGlobalWait(){ const w=document.querySelector('._ai-wait'); if (w){ w.remove(); } }

  // --- Scroll-lock / jump-to-latest ---
  let jumpBtn;
  function attachChatScroll(){
    if (!el.chatArea) return;
    if (!jumpBtn){
      jumpBtn = document.createElement('button');
      jumpBtn.className='jump-latest';
      jumpBtn.innerHTML = `<img class="ui-icon" src="${ICONS_BASE}/arrow-down.svg" alt=""> Į naujausią`;
      jumpBtn.addEventListener('click', ()=>{ el.chatArea.scrollTo({top:el.chatArea.scrollHeight, behavior:'smooth'}); jumpBtn.classList.remove('show'); state.stickToBottom=true; });
      document.body.appendChild(jumpBtn);
    }
    const onScroll = ()=>{
      const nearBottom = (el.chatArea.scrollTop + el.chatArea.clientHeight >= el.chatArea.scrollHeight - 80);
      state.stickToBottom = !!nearBottom;
      jumpBtn?.classList.toggle('show', !nearBottom);
    };
    el.chatArea.addEventListener('scroll', onScroll, { passive:true });
    onScroll();
  }
  function scrollToBottomIfNeeded(){
    if (!el.chatArea) return;
    if (state.stickToBottom){
      el.chatArea.scrollTo({ top: el.chatArea.scrollHeight });
      jumpBtn?.classList.remove('show');
    }else{
      jumpBtn?.classList.add('show');
    }
  }
  function updateBottomDock(){
    if (!el.bottomSection || !el.chatArea) return;
    const h = el.bottomSection.getBoundingClientRect().height || 0;
    el.chatArea.style.paddingBottom = Math.max(16, Math.ceil(h + 8))+'px';
  }

  // --- Transportai / utils ---
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

  function randomBetween(a,b){ return Math.floor(a + Math.random()*(b-a+1)); }
  function splitWordsPreserve(text){ return String(text||'').split(/(\s+)/); }
  async function typeInto(panel, text){
    const parts = splitWordsPreserve(text);
    for (let i=0;i<parts.length;i++){
      const w = parts[i];
      panel.content += w;
      panel.el.innerHTML = parseMarkdown(panel.content);
      scrollToBottomIfNeeded();
      const isSentenceEnd = /[.!?…]$/.test(w);
      await sleep(isSentenceEnd ? randomBetween(SENTENCE_PAUSE_MIN,SENTENCE_PAUSE_MAX) : randomBetween(TYPE_MIN_DELAY, TYPE_MAX_DELAY));
    }
  }

  function appendFade(node){
    node.style.opacity='0'; node.style.transform='translateY(16px)';
    el.chatArea?.appendChild(node);
    requestAnimationFrame(()=>{ node.style.transition='all .25s ease'; node.style.opacity='1'; node.style.transform='translateY(0)'; });
  }

  // --- Markdown (spalvos + bold glow + „####“ fix) ---
  function parseMarkdown(input){
    let src = String(input||'');

    // pašalinam plikas antraštes streamo gale (pvz. "####" be teksto)
    src = src.replace(/(^|\n)#{1,6}\s*$/g, '$1');

    const HCOL = { 1:'#111827', 2:'#2563eb', 3:'#7c3aed', 4:'#16a34a', 5:'#f59e0b', 6:'#6b7280' };
    let t = escapeHtml(src);

    // saugojam ```code```
    const STORE=[]; t=t.replace(/```([\s\S]*?)```/g,(_,m)=>`@@CB_${STORE.push(m)-1}@@`);

    // inline code
    t = t.replace(/`([^`]+)`/g, (_,m)=> `<code style="background:rgba(0,0,0,.06);padding:2px 4px;border-radius:4px">${m}</code>`);

    // headings (H1—H6 spalvotos)
    t = t.replace(/^\s*######\s+(.+)$/gm, `<h6 style="margin:.25em 0 .15em;color:${HCOL[6]};font-weight:800">$1</h6>`);
    t = t.replace(/^\s*#####\s+(.+)$/gm, `<h5 style="margin:.3em 0 .2em;color:${HCOL[5]};font-weight:800">$1</h5>`);
    t = t.replace(/^\s*####\s+(.+)$/gm,  `<h4 style="margin:.35em 0 .2em;color:${HCOL[4]};font-weight:800">$1</h4>`);
    t = t.replace(/^\s*###\s+(.+)$/gm,   `<h3 style="margin:.4em 0 .2em;color:${HCOL[3]};font-weight:800">$1</h3>`);
    t = t.replace(/^\s*##\s+(.+)$/gm,    `<h2 style="margin:.5em 0 .25em;color:${HCOL[2]};font-weight:900">$1</h2>`);
    t = t.replace(/^\s*#\s+(.+)$/gm,     `<h1 style="margin:.6em 0 .3em;color:${HCOL[1]};font-weight:900;font-size:1.15em">$1</h1>`);

    // listai
    t = t.replace(/(^|\n)(?:[-*]\s.+)(?:\n[-*]\s.+)*/g, (block)=>{
      const lines = block.trim().split('\n').map(l=> l.replace(/^[-*]\s+/,'').trim());
      return `\n<ul style="margin:.25em 0 .25em .9em; padding:0; list-style:disc inside;">` +
        lines.map(li=>`<li>${li}</li>`).join('') + `</ul>`;
    });
    t = t.replace(/(^|\n)(?:\d+[.)]\s.+)(?:\n\d+[.)]\s.+)*/g, (block)=>{
      const lines = block.trim().split('\n').map(l=> l.replace(/^\d+[.)]\s+/,'').trim());
      return `\n<ol style="margin:.25em 0 .25em 1.1em; padding:0; list-style:decimal inside;">` +
        lines.map(li=>`<li>${li}</li>`).join('') + `</ol>`;
    });

    // emphasis
    t = t.replace(/\*\*([^*]+)\*\*/g, `<strong style="color:#111827;text-shadow:0 0 1px #5b3cc4">$1</strong>`);
    t = t.replace(/\*([^*]+)\*/g, `<em>$1</em>`);

    // newlines
    t = t.replace(/\n/g, '<br>');

    // grąžinam code blocks
    t = t.replace(/@@CB_(\d+)@@/g, (_,i)=> `<pre style="background:rgba(0,0,0,.06);padding:10px;border-radius:10px;overflow:auto"><code>${STORE[Number(i)]||''}</code></pre>`);

    return t;
  }

  function parseErr(e){
    try{
      const data = (e && e.data) ? JSON.parse(e.data) : {};
      return data?.message || 'Klaida';
    }catch(_){ return 'Klaida'; }
  }
  function stripMd(s){ return String(s||'').replace(/`{1,3}[\s\S]*?`{1,3}/g,'').replace(/[*_#>-]/g,''); }
  function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
  function timeNow(){ return new Date().toLocaleTimeString('lt-LT',{hour:'2-digit',minute:'2-digit'}); }
  function escapeHtml(x){ const d=document.createElement('div'); d.textContent=(x==null?'':String(x)); return d.innerHTML; }
  function safeDelta(s){
    if (!s) return '';
    if (s === '[DONE]') return '';
    try{
      const o = JSON.parse(s);
      return o.text || o.delta || o.content || (o?.choices?.[0]?.delta?.content) || '';
    }catch(_){
      // jei ateina paprastas tekstas – grąžinam jį
      return s;
    }
  }
  function uniqueNonEmpty(arr){ const s=new Set(); const out=[]; (arr||[]).forEach(v=>{ const t=String(v||'').trim(); if(t&&!s.has(t)){ s.add(t); out.push(t);} }); return out; }

  function toast(title, details){
    const n=document.createElement('div');
    n.className='error-notification';
    n.innerHTML = `<div style="font-weight:600;margin-bottom:4px">${escapeHtml(title)}</div>${
      details?`<div style="font-size:12px;opacity:.8">${escapeHtml(details)}</div>`:''}`;
    document.body.appendChild(n);
    setTimeout(()=>n.remove(), 6000);
  }
  function log(){ try{ console.log('[PAULE]', ...arguments); }catch(_){ } }

  // --- Sprendimų režimai (ginčas/kompromisas/teisėjas) ---
  function startDebate(){
    addSystemMessage('🔁 Pradedamas AI ginčas – kiekvienas modelis pateiks 3–5 argumentus.');
    const fronts = getActiveFront();
    const prompt = state.lastUserText ?
      `${state.lastUserText}\n\nREŽIMAS: GINČAS.\nInstrukcija: Pateik 3–5 stipriausius argumentus, kodėl tavo siūlomas atsakymas/planas yra geriausias. Struktūra: • Argumentas • Įrodymas • Rizika.` :
      'AI ginčas: pateik argumentus.';
    sendAsNewRound(prompt, fronts);
  }
  function startCompromise(){
    const answers = Object.entries(state.lastRound||{}).map(([model,txt])=>`[${model}]: ${txt}`).join('\n\n');
    if (!answers){ toast('Trūksta atsakymų', 'Pirmiausia gauk bent vieną modelio atsakymą.'); return; }
    addSystemMessage('🤝 Kompromisas: suderiname modelių atsakymus į vieną planą.');
    const prompt = `Žemiau – keli skirtingų modelių atsakymai.\nSujunk į vieną realistišką sprendimą (žingsniai, rizikos, KPI, „next actions“).\n\n${answers}\n\nGrąžink: • Santrauka • Vieningas sprendimas • 3 KPI • Pirmi 5 žingsniai.`;
    sendAsNewRound(prompt, ['auto']);
  }
  function startJudge(){
    const answers = Object.entries(state.lastRound||{}).map(([model,txt])=>`[${model}]: ${txt}`).join('\n\n');
    if (!answers){ toast('Trūksta atsakymų', 'Pirmiausia gauk bent vieną modelio atsakymą.'); return; }
    addSystemMessage('⚖️ Teisėjas vertina atsakymus…');
    const prompt = `Tu esi „Teisėjas“.\nĮvertink pateiktus atsakymus ir parink geriausią.\nGrąžink: • Verdiktas • Kodėl • Kurio modelio idėja • 2 silpnybės kitų variantų • Finalus planas.\n\n${answers}`;
    sendAsNewRound(prompt, ['llama']);
  }
  function sendAsNewRound(prompt, fronts){
    addUserBubble(prompt);
    resetRound();
    startOrchestrator(prompt, fronts).catch(()=>finalizeRound());
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

  // Expose viešai
  window.PauleMain = { state, sendMessage, startDebate, startCompromise, startJudge };

})();  // /assets/js/paule-ui.js (orchestrator)

/* =======================================================================
   Paule – Modelių žemėlapis • v1.3.0
   Front (mygtuko id) -> Back (API model id) + transporto gebėjimai
   ======================================================================= */
(function () {
  'use strict';

  // Front (mygtuko id) -> Back (API model id)
  const FRONT_TO_BACK = Object.freeze({
    'auto':'auto','paule':'auto','augam-auto':'auto',
    'chatgpt':'gpt-4o-mini',
    'claude':'claude-4-sonnet',
    'gemini':'gemini-2.5-flash',
    'grok':'grok-4',
    'deepseek':'deepseek-chat',
    'llama':'meta-llama/Llama-4-Scout-17B-16E-Instruct'
  });

  const BACK_TO_FRONT = Object.freeze(
    Object.entries(FRONT_TO_BACK).reduce((m,[f,b]) => (m[b]=f,m), {})
  );

  const MODEL_NAME = Object.freeze({
    'auto':'Paule','paule':'Paule','augam-auto':'Paule',
    'chatgpt':'ChatGPT','gpt-4o-mini':'ChatGPT',
    'claude':'Claude','claude-4-sonnet':'Claude',
    'gemini':'Gemini','gemini-2.5-flash':'Gemini',
    'grok':'Grok','grok-4':'Grok',
    'deepseek':'DeepSeek','deepseek-chat':'DeepSeek',
    'llama':'Llama','meta-llama/Llama-4-Scout-17B-16E-Instruct':'Llama',
    'judge':'Teisėjas'
  });

  const ICONS_BASE = (window.PAULE_CONFIG && window.PAULE_CONFIG.iconsBase) || '/assets/icon';
  const MODEL_ICON = Object.freeze({
    'auto': `${ICONS_BASE}/ai.svg`,
    'paule': `${ICONS_BASE}/ai.svg`,
    'chatgpt': `${ICONS_BASE}/chatgpt.svg`,
    'claude': `${ICONS_BASE}/claude-seeklogo.svg`,
    'gemini': `${ICONS_BASE}/gemini.svg`,
    'grok': `${ICONS_BASE}/xAI.svg`,
    'deepseek': `${ICONS_BASE}/deepseek.svg`,
    'llama': `${ICONS_BASE}/llama.svg`,
    'judge': `${ICONS_BASE}/legal-contract.svg`
  });

  // šituos laikom „JSON only“ (SSE pas juos neveikia) → JSON once fallback
  const NON_SSE_FRONT = new Set(['claude','gemini','grok','claude-4-sonnet','gemini-2.5-flash','grok-4']);

  const lc = s => String(s||'').toLowerCase().trim();
  function canonicalFrontId(id){
    if (!id) return 'auto';
    let s=lc(id);
    if (!FRONT_TO_BACK[s] && BACK_TO_FRONT[id]) s=BACK_TO_FRONT[id];
    if (s==='paule' || s==='augam-auto') s='auto';
    return s;
  }
  function getBackId(front){ const f=canonicalFrontId(front); return FRONT_TO_BACK[f]||f||'auto'; }
  function nameOf(id){ return MODEL_NAME[id] || MODEL_NAME[canonicalFrontId(id)] || String(id); }
  function iconOf(id){ const f=canonicalFrontId(id); return MODEL_ICON[f] || MODEL_ICON.auto; }
  function isSSECapable(front){ const f=canonicalFrontId(front); return !NON_SSE_FRONT.has(f); }

  function normalizeModelsInput(list){
    if (!list) return ['auto'];
    if (typeof list==='string'){
      list = list.split(',').map(s=>s.trim()).filter(Boolean);
    }
    const set=new Set(list.map(canonicalFrontId).filter(Boolean));
    if (!set.size) set.add('auto');
    return Array.from(set);
  }

  function splitTransports(frontList){
    const out={stream:[],json:[]};
    normalizeModelsInput(frontList).forEach(fid=>{
      if (fid==='auto'){ out.stream.push('auto'); return; }
      (isSSECapable(fid)?out.stream:out.json).push(fid);
    });
    return out;
  }

  function listAll(){
    const seen=new Set(); const fronts=Object.keys(FRONT_TO_BACK); const items=[];
    fronts.forEach(f=>{
      if (seen.has(f)) return; seen.add(f);
      const back=FRONT_TO_BACK[f]||f;
      items.push({ id:f, back, name:nameOf(f), icon:iconOf(f), sse:isSSECapable(f) });
    });
    items.push({ id:'judge', back:'meta-llama/Llama-4-Scout-17B-16E-Instruct', name:nameOf('judge'), icon:iconOf('judge'), sse:true });
    return items;
  }

  async function ensureCapabilities(){ /* jei reikės – galit įdėti ping’ą */ return true; }

  const API={ FRONT_TO_BACK,BACK_TO_FRONT,MODEL_NAME,MODEL_ICON,NON_SSE_FRONT,
    canonicalFrontId,getBackId,nameOf,iconOf,isSSECapable,
    normalizeModelsInput,splitTransports,listAll,ensureCapabilities
  };
  try{ Object.freeze(API);}catch(_){}
  window.PAULE_MODELS=API;
  window.getBackId=window.getBackId||getBackId;
  window.nameOf=window.nameOf||nameOf;
})();
