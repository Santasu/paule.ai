/* =======================================================================
   Paule – Modelių žemėlapis • v1.5.0
   Front (mygtuko id) -> Back (API model id) + transporto gebėjimai
   ======================================================================= */
(function () {
  'use strict';

  // Front (mygtuko id) -> Back (API model id)
  const FRONT_TO_BACK = Object.freeze({
    'auto'      : 'auto',

    // Paule – dabar per Together → openai/gpt-oss-20b (stabilus, atskiras nuo Llama)
    'paule'     : 'openai/gpt-oss-20b',

    'augam-auto': 'auto',

    // ChatGPT
    'chatgpt'   : 'gpt-5-mini',

    // Claude 4 Sonnet (fallback server’yje)
    'claude'    : 'claude-4-sonnet',

    // Gemini
    'gemini'    : 'gemini-2.5-flash',

    // Grok
    'grok'      : 'grok-4',

    // DeepSeek – naujas modelis (V3.1); galima override’inti ENV’u server side
    'deepseek'  : 'deepseek-v3.1',

    // Llama – kaip anksčiau (atskirta nuo „Paule“)
    'llama'     : 'meta-llama/Llama-4-Scout-17B-16E-Instruct'
  });

  const BACK_TO_FRONT = Object.freeze(
    Object.entries(FRONT_TO_BACK).reduce((m,[f,b]) => (m[b]=f,m), {})
  );

  const MODEL_NAME = Object.freeze({
    'auto':'Paule','paule':'Paule','augam-auto':'Paule',
    'chatgpt':'ChatGPT','gpt-5-mini':'ChatGPT',
    'claude':'Claude','claude-4-sonnet':'Claude',
    'gemini':'Gemini','gemini-2.5-flash':'Gemini',
    'grok':'Grok','grok-4':'Grok',
    'deepseek':'DeepSeek','deepseek-v3.1':'DeepSeek',
    'llama':'Llama','meta-llama/Llama-4-Scout-17B-16E-Instruct':'Llama',
    'openai/gpt-oss-20b':'Paule',
    'judge':'Teisėjas'
  });

  const ICONS_BASE = (window.PAULE_CONFIG && window.PAULE_CONFIG.iconsBase) || '/assets/icon';
  const MODEL_ICON = Object.freeze({
    'auto'   : `${ICONS_BASE}/ai.svg`,
    'paule'  : `${ICONS_BASE}/ai.svg`,
    'chatgpt': `${ICONS_BASE}/chatgpt.svg`,
    'claude' : `${ICONS_BASE}/claude-seeklogo.svg`,
    'gemini' : `${ICONS_BASE}/gemini.svg`,
    'grok'   : `${ICONS_BASE}/xAI.svg`,
    'deepseek':`${ICONS_BASE}/deepseek.svg`,
    'llama'  : `${ICONS_BASE}/llama.svg`,
    'judge'  : `${ICONS_BASE}/legal-contract.svg`
  });

  // JSON only frontai (šiuo metu – nieko; viską stumdom per /api/stream SSE)
  const NON_SSE_FRONT = new Set([]);

  const lc = s => String(s||'').toLowerCase().trim();
  function canonicalFrontId(id){
    if (!id) return 'auto';
    let s=lc(id);
    if (!FRONT_TO_BACK[s] && BACK_TO_FRONT[id]) s=BACK_TO_FRONT[id];
    if (s==='augam-auto') s='auto';
    return s;
  }

  function getBackId(front){ const f=canonicalFrontId(front); return FRONT_TO_BACK[f]||f||'auto'; }
  function nameOf(id){ return MODEL_NAME[id] || MODEL_NAME[canonicalFrontId(id)] || String(id); }
  function iconOf(id){ const f=canonicalFrontId(id); return MODEL_ICON[f] || MODEL_ICON.auto; }
  function isSSECapable(front){ const f=canonicalFrontId(front); return !NON_SSE_FRONT.has(f); }

  function normalizeModelsInput(list){
    if (!list) return ['auto'];
    if (typeof list==='string'){ list = list.split(',').map(s=>s.trim()).filter(Boolean); }
    const set=new Set(list.map(canonicalFrontId).filter(Boolean));
    if (!set.size) set.add('auto');
    return Array.from(set);
  }

  function splitTransports(frontList){
    const out={stream:[],json:[]};
    normalizeModelsInput(frontList).forEach(fid=>{
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

  async function ensureCapabilities(){ return true; }

  const API={ FRONT_TO_BACK,BACK_TO_FRONT,MODEL_NAME,MODEL_ICON,NON_SSE_FRONT,
    canonicalFrontId,getBackId,nameOf,iconOf,isSSECapable,
    normalizeModelsInput,splitTransports,listAll,ensureCapabilities
  };
  try{ Object.freeze(API);}catch(_){}
  window.PAULE_MODELS=API;
  window.getBackId=window.getBackId||getBackId;
  window.nameOf=window.nameOf||nameOf;
})();

/* =======================================================================
   Paule – Premium Chat Orchestrator • v2.4.0
   Nauja: per-modelio ISTORIJA (kiekvienas modelis mato tik savo chat’ą)
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
  const DEBUG = !!CFG.debug;

  // Tunables
  const SOFT_TIMEOUT_MS = 900;
  const HARD_DEADLINE_MS = 25000;
  const TYPE_MIN_DELAY = 8, TYPE_MAX_DELAY = 16;
  const SENTENCE_PAUSE_MIN = 120, SENTENCE_PAUSE_MAX = 220;
  const HISTORY_MAX_MESSAGES = 12; // kiek daugiausiai žinučių siunčiam „į praeitį“ per GET

  // --- Bendra būsena ---
  const state = {
    theme: getInitialTheme(),
    selectedModels: ['auto'],
    isStreaming:false,
    chatId: 'chat_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,8),
    lastUserText:'',
    hasMessagesStarted:false,
    stickToBottom:true,

    // round
    panels:{},          // frontId -> { el, content, done }
    startedOrder:[],
    firstStarted:null,
    pending:0,
    errors:[],
    hasAnyText:false,
    suggestShown:false,

    // istorija per modelį
    historyByFront: {}  // { frontId: [ {role:'user'|'assistant', content} ] }
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
      injectTypingDotsStyle();
      applyTheme(); bindEvents(); setInitialModelSelection(); updateBottomDock(); attachChatScroll();
      if (el.chatArea) el.chatArea.querySelectorAll('.message,.thinking,._ai-wait')?.forEach(n=>n.remove());
      startFeedsAutoRefresh();

      try {
        if (window.PAULE_MODELS && typeof window.PAULE_MODELS.ensureCapabilities === 'function') {
          await window.PAULE_MODELS.ensureCapabilities();
        }
      } catch(_){}

      debug('🚀 Paule Orchestrator su istorija įkeltas.');
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

    // Įrašom user žinutę į visų aktyvių frontų istoriją
    const fronts = getActiveFront();
    fronts.forEach(f=> pushHistory(f, { role:'user', content:text }));

    resetRound(); // round reset – istorijos neliest!

    state.lastUserText = text;
    if (!state.hasMessagesStarted){ state.hasMessagesStarted = true; updateBottomDock(); }
    hideWelcome();
    addUserBubble(text);
    el.messageInput.value=''; autoGrow();

    try{
      await startOrchestrator(text, fronts);
    }catch(e){
      toast('Klaida siunčiant žinutę', e?.message||String(e));
      finalizeRound();
    }
  }

  function resetRound(){
    state.isStreaming = true;
    state.panels = {}; state.startedOrder = []; state.firstStarted = null;
    state.pending = 0; state.errors = []; state.hasAnyText=false; state.suggestShown=false;
    showGlobalWait();
  }

  function pushHistory(front, msg){
    const f = (window.PAULE_MODELS?.canonicalFrontId(front)) || front;
    if (!state.historyByFront[f]) state.historyByFront[f] = [];
    state.historyByFront[f].push({ role: msg.role, content: String(msg.content||'') });
    // saugiklis: apkarpom iki HISTORY_MAX_MESSAGES nuo galo
    const arr = state.historyByFront[f];
    if (arr.length > HISTORY_MAX_MESSAGES) state.historyByFront[f] = arr.slice(arr.length - HISTORY_MAX_MESSAGES);
  }
  function encodeHistory(front){
    const f = (window.PAULE_MODELS?.canonicalFrontId(front)) || front;
    const arr = state.historyByFront[f] || [];
    try{
      const json = JSON.stringify(arr);
      return btoa(encodeURIComponent(json));
    }catch{ return ''; }
  }

  // --- UI ---
  function hideWelcome(){ if (!el.welcome) return; el.welcome.style.display='none'; }
  function autoGrow(){
    const i = el.messageInput; if (!i) return;
    i.style.height='auto';
    const max = Math.floor(window.innerHeight * 0.40);
    i.style.height = Math.min(i.scrollHeight, max)+'px';
  }

  const MODEL_ICON = {
    chatgpt:`${ICONS_BASE}/chatgpt.svg`, claude:`${ICONS_BASE}/claude-seeklogo.svg`,
    gemini:`${ICONS_BASE}/gemini.svg`,  grok:`${ICONS_BASE}/xAI.svg`,
    deepseek:`${ICONS_BASE}/deepseek.svg`, llama:`${ICONS_BASE}/llama.svg`,
    auto:`${ICONS_BASE}/ai.svg`, paule:`${ICONS_BASE}/ai.svg`, judge:`${ICONS_BASE}/legal-contract.svg`
  };
  const nameOf = (id)=> (window.PAULE_MODELS && typeof window.PAULE_MODELS.nameOf==='function') ? window.PAULE_MODELS.nameOf(id) : id;
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
          <div class="msg-content"><span class="typing-dots"><i></i><i></i><i></i></span></div>
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

  function preparePanels(frontList){
    (frontList||[]).forEach(f=> ensurePanel(f));
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

    preparePanels([ ...streamF, ...jsonF ]);
    state.pending = (streamF.length) + (jsonF.length);
    debug('Start round:', {streamF, jsonF, pending: state.pending});

    streamF.forEach(front=>{
      const back = getBackId(front);
      runSSE({ front, back, message, chatId: state.chatId, historyParam: encodeHistory(front) })
        .catch(err=> debug('runSSE error', front, err))
        .finally(()=>decPending());
    });

    if (jsonF.length){
      setTimeout(()=>{
        runJSONOnce({ fronts: jsonF, message, chatId: state.chatId })
          .catch(err=> debug('runJSONOnce error', err));
      }, SOFT_TIMEOUT_MS);
    }

    setTimeout(()=>{ finishIfHanging(); }, HARD_DEADLINE_MS);
  }

  function finishIfHanging(){
    if (!state.isStreaming) return;
    state.isStreaming=false;
    hideGlobalWait();
    finalizeRound();
  }

  // --- SSE runner ---
  function runSSE({ front, back, message, chatId, historyParam }){
    return new Promise((resolve) => {
      const qs = { model: back, models: back, message, max_tokens:4096, chat_id:chatId, _t:Date.now() };
      if (historyParam) qs.h = historyParam;
      const url = buildStreamUrl(qs);
      debug('SSE open →', front, back, url);
      const es = new EventSource(url);
      let gotAny=false, closed=false;

      const finalize = ()=>{
        if (closed) return; closed=true;
        try{ es.close(); }catch(_){}
        resolve();
      };

      es.addEventListener('open', ()=> debug('SSE open evt', front));
      es.addEventListener('start', e=>{
        try{ const d = JSON.parse(e.data||'{}'); if (d?.chat_id) state.chatId=d.chat_id; }catch(_){}
        debug('SSE start evt', front);
      });

      const handleDelta = (payload)=>{
        if (payload == null) return;
        if (String(payload).trim() === '[DONE]'){
          const panel = state.panels[front]; if (panel) panel.done = true;
          // baigė – įrašom assistant atsakymą į to FRONT istoriją
          const txt = (panel?.content||'').trim();
          if (txt) pushHistory(front, { role:'assistant', content: txt });
          debug('SSE done marker', front);
          finalize(); return;
        }

        const piece = safeDelta(payload);
        if (!piece) return;

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
      es.addEventListener('message', e=> handleDelta(e.data||''));
      es.onmessage = (e)=> handleDelta(e.data||'');

      es.addEventListener('error', e=>{
        const msg = parseErr(e) || 'Modelio paslauga laikinai nepasiekiama.';
        state.errors.push({ front, name: nameOf(front), msg });
        debug('SSE error evt', front, msg);
        finalize();
      });

      es.addEventListener('done', _=>{
        const panel = state.panels[front];
        if (panel) panel.done = true;
        const txt = (panel?.content||'').trim();
        if (txt) pushHistory(front, { role:'assistant', content: txt });
        debug('SSE done evt', front);
        finalize();
      });

      es.onerror = function(ev){
        if (!gotAny){
          state.errors.push({ front, name: nameOf(front), msg: 'Ryšio klaida (SSE).' });
        }
        debug('SSE onerror', front, ev);
        finalize();
      };
    });
  }

  // --- JSON once runner (grupė) – jei kada naudosi
  async function runJSONOnce({ fronts, message, chatId }){
    if (!fronts || !fronts.length) return;
    const backIds = fronts.map(f=> (window.PAULE_MODELS?window.PAULE_MODELS.getBackId(f):f)).join(',');
    debug('JSON call →', fronts, backIds);
    try{
      const res = await postJSON(COMPLETE_URL, {
        message, models: backIds, chat_id: chatId, max_tokens:4096,
        history: fronts.reduce((acc,f)=>{ acc[f]=state.historyByFront[f]||[]; return acc; }, {})
      });

      const answers = Array.isArray(res?.answers) ? res.answers : [];
      const mappedFronts = new Set();

      for (const ans of answers){
        const back = ans.model||'';
        const front = (window.PAULE_MODELS && window.PAULE_MODELS.BACK_TO_FRONT && window.PAULE_MODELS.BACK_TO_FRONT[back]) || fronts[0];
        mappedFronts.add(front);

        const panel = ensurePanel(front);
        if (!state.hasAnyText){ state.hasAnyText=true; hideGlobalWait(); if (!state.firstStarted) state.firstStarted = front; }

        const text = (ans.text || '').trim();
        const err  = (ans.error || '').trim();

        if (text){
          await typeInto(panel, text);
          panel.done = true;
          pushHistory(front, { role:'assistant', content: text });
        }else{
          const msg = err || 'Nepavyko gauti atsakymo (JSON).';
          state.errors.push({ front, name:nameOf(front), msg });
        }
        decPending();
      }

      const errs = Array.isArray(res?.errors) ? res.errors : [];
      errs.forEach(er=>{
        const front = (er && er.front) ? er.front : null;
        const name  = front ? nameOf(front) : 'Serveris';
        const msg   = (er && (er.error||er.message)) || 'Nepavyko gauti atsakymo (JSON).';
        state.errors.push({ front: front||'auto', name, msg });
      });

      fronts.forEach(f=>{
        if (!mappedFronts.has(f)){
          state.errors.push({ front:f, name:nameOf(f), msg:'Nepavyko gauti atsakymo (JSON).' });
          decPending();
        }
      });
    }catch(e){
      fronts.forEach(f=>{
        state.errors.push({ front:f, name:nameOf(f), msg:'Nepavyko gauti atsakymo (JSON).' });
        decPending();
      });
      debug('runJSONOnce exception', e);
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

    if (!state.suggestShown){
      state.suggestShown = true;
      showFollowUps();
    }
  }

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

  // --- Scroll ir pan. (be pakeitimų esmėje) ---
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

  // --- Helpers ---
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

  // --- Markdown parsing (kaip buvo) ---
  function parseMarkdown(input){
    let src = String(input||'');
    src = src.replace(/(^|\n)#{1,6}\s*$/g, '$1');
    const HCOL = { 1:'#111827', 2:'#2563eb', 3:'#7c3aed', 4:'#16a34a', 5:'#f59e0b', 6:'#6b7280' };
    let t = escapeHtml(src);
    const STORE=[]; t=t.replace(/```([\s\S]*?)```/g,(_,m)=>`@@CB_${STORE.push(m)-1}@@`);
    t = t.replace(/`([^`]+)`/g, (_,m)=> `<code style="background:rgba(0,0,0,.06);padding:2px 4px;border-radius:4px">${m}</code>`);
    t = t.replace(/^\s*######\s+(.+)$/gm, `<h6 style="margin:.25em 0 .15em;color:${HCOL[6]};font-weight:800">$1</h6>`);
    t = t.replace(/^\s*#####\s+(.+)$/gm, `<h5 style="margin:.3em 0 .2em;color:${HCOL[5]};font-weight:800">$1</h5>`);
    t = t.replace(/^\s*####\s+(.+)$/gm,  `<h4 style="margin:.35em 0 .2em;color:${HCOL[4]};font-weight:800">$1</h4>`);
    t = t.replace(/^\s*###\s+(.+)$/gm,   `<h3 style="margin:.4em 0 .2em;color:${HCOL[3]};font-weight:800">$1</h3>`);
    t = t.replace(/^\s*##\s+(.+)$/gm,    `<h2 style="margin:.5em 0 .25em;color:${HCOL[2]};font-weight:900">$1</h2>`);
    t = t.replace(/^\s*#\s+(.+)$/gm,     `<h1 style="margin:.6em 0 .3em;color:${HCOL[1]};font-weight:900;font-size:1.15em">$1</h1>`);
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
    t = t.replace(/\*\*([^*]+)\*\*/g, `<strong style="color:#111827;text-shadow:0 0 1px #5b3cc4">$1</strong>`);
    t = t.replace(/\*([^*]+)\*/g, `<em>$1</em>`);
    t = t.replace(/\n/g, '<br>');
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
    let str = String(s);
    try{
      const o = JSON.parse(str);
      if (typeof o === 'string') return o;
      if (o?.text) return String(o.text);
      if (o?.delta && typeof o.delta === 'string') return o.delta;
      if (o?.content && typeof o.content === 'string') return o.content;
      const ch = o?.choices?.[0];
      if (ch?.delta?.content) return String(ch.delta.content);
      if (ch?.message?.content) return String(ch.message.content);
      if (Array.isArray(o?.content) && o.content[0]?.text) return String(o.content[0].text);
    }catch(_){ }
    return str;
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

  function debug(){ if (DEBUG) try{ console.log('[PAULE]', ...arguments); }catch(_){ } }

  // Public API (jei reikės)
  window.PauleMain = { state, sendMessage };
})();
