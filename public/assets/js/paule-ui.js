/* =======================================================================
   Paule – Premium Chat (Vercel) • v1.1.0
   UI/transport klientas be WP. API bazė iš window.PAULE_CONFIG (index.html).
   ======================================================================= */
(function () {
  'use strict';

  try { window.U = window.U || {}; if (!Array.isArray(window.U.stack)) window.U.stack = []; } catch(_){}

  const rtrim = s => String(s||'').replace(/\/+$/,'');
  let PLUGIN_BASE='/assets', FEATURES_BASE='/assets/features', ICONS_BASE='/assets/icon', API_BASE='/api', SSE_ENDPOINT=API_BASE+'/stream?mode=sse';
  if (window.PAULE_CONFIG){ const C=window.PAULE_CONFIG;
    if (C.pluginBase)   PLUGIN_BASE   = rtrim(C.pluginBase);
    if (C.featuresBase) FEATURES_BASE = rtrim(C.featuresBase);
    if (C.iconsBase)    ICONS_BASE    = rtrim(C.iconsBase);
    if (C.restBase)     API_BASE      = rtrim(C.restBase);
    SSE_ENDPOINT = rtrim(C.restStreamSSE || C.restStream || (API_BASE+'/stream?mode=sse'));
  }
  const normSSE = s=>{ if(!s) return API_BASE+'/stream'; let u=String(s); u=u.replace(/\?.*$/,'').replace(/\/stream-sse$/,'/stream'); return u; };

  const FRONT_TO_BACK = {
    'auto':'auto','paule':'auto','augam-auto':'auto',
    chatgpt:'gpt-4o-mini', claude:'claude-4-sonnet', gemini:'gemini-2.5-flash',
    grok:'grok-4', deepseek:'deepseek-chat',
    llama:'meta-llama/Llama-4-Scout-17B-16E-Instruct',
  };
  const getBackId = f => FRONT_TO_BACK[f] || f || 'auto';
  const MODEL_NAME = {
    auto:'Paule', paule:'Paule', 'augam-auto':'Paule',
    chatgpt:'ChatGPT', claude:'Claude', gemini:'Gemini', grok:'Grok', deepseek:'DeepSeek', llama:'Llama',
    'gpt-4o-mini':'ChatGPT','claude-4-sonnet':'Claude','gemini-2.5-flash':'Gemini',
    'grok-4':'Grok','deepseek-chat':'DeepSeek','meta-llama/Llama-4-Scout-17B-16E-Instruct':'Llama'
  };
  const nameOf = id => MODEL_NAME[id] || id;

  const NON_SSE_FRONT = new Set(['claude','grok','gemini','claude-4-sonnet','grok-4','gemini-2.5-flash']);

  const state = {
    theme: getInitialTheme(),
    selectedModels: ['auto'],
    isStreaming:false, chatId:null, lastUserText:'', lastRound:{},
    modelPanels:{}, boundPanels:{}, hasMessagesStarted:false, stickToBottom:true,
    decisionBarShown:false
  };

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
    specialistGrid: document.querySelector('.specialist-grid'),
    mobileOverlay: document.getElementById('mobileOverlay'),
    bottomSection: document.getElementById('bottomSection'),
    projectsList: document.getElementById('projectsList'),
    historyList: document.getElementById('historyList'),
    songsFeed: document.getElementById('songsFeed'),
    photosFeed: document.getElementById('photosFeed'),
    videosFeed: document.getElementById('videosFeed'),
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();

  function init(){
    try{
      applyTheme(); bindEvents(); setInitialModelSelection(); updateBottomDock(); attachChatScroll();
      if (el.chatArea) el.chatArea.querySelectorAll('.message,.thinking')?.forEach(n=>n.remove());
      startFeedsAutoRefresh();
      log('🚀 Paule UI įkeltas. SSE endpoint:', normSSE(SSE_ENDPOINT));
    }catch(e){ console.error('[PAULE]init', e); toast('Inicializacijos klaida: '+e.message); }
  }

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
    document.querySelector('.tools-bar')?.addEventListener('click', onToolClick);

    // Sprendimų juosta
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

  function getInitialTheme(){
    try{ const s=localStorage.getItem('paule_theme'); if (s&&s!=='auto') return s; }catch(_){}
    const h=new Date().getHours(); return (h>=20||h<7)?'dark':'light';
  }
  function applyTheme(){ document.documentElement.setAttribute('data-theme', state.theme); }

  function onToolClick(e){
    const tool = e.target.closest('.tool'); if (!tool) return;
    const t = tool.getAttribute('data-tool');
    switch (t){
      case 'song':   openCreative('musicPopup'); break;
      case 'photo':  openCreative('photoPopup'); break;
      case 'file':   openCreative('filePopup'); break;
      case 'video':  openCreative('videoPopup'); break;
      case 'mindmap': openCreative('mindmapPopup'); break;
      default: toast('Įrankis dar kuriamas: '+t);
    }
  }
  function openCreative(id){
    let p=document.getElementById(id);
    if(!p){
      p=document.createElement('div'); p.id=id; p.className='creative-popup active';
      p.innerHTML=`<div class="popup-overlay"><div class="popup-content"><div class="popup-header">
        <h2>${id}</h2><button class="popup-close" onclick="this.closest('.creative-popup').classList.remove('active')">×</button>
      </div><div class="popup-body"><p>Modulis dar neįkeltas.</p></div></div></div>`;
      document.body.appendChild(p);
    } else p.classList.add('active');
  }

  /* ===== Modeliai ===== */
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
  const getActiveFront = () => (state.selectedModels.length? state.selectedModels.slice() : ['auto']);
  function setInitialModelSelection(){
    el.modelList?.querySelectorAll('.model-pill').forEach(p=>p.classList.remove('active'));
    el.modelList?.querySelector('.model-pill[data-model="auto"]')?.classList.add('active');
  }

  /* ===== Siuntimas ===== */
  function sendMessage(){
    const text = (el.messageInput?.value || '').trim(); if (!text) return;
    if (state.isStreaming) stopStream();
    state.lastUserText = text;

    if (!state.hasMessagesStarted){ state.hasMessagesStarted = true; updateBottomDock(); }
    hideWelcome();
    addUserBubble(text);
    el.messageInput.value=''; autoGrow();

    const front = getActiveFront();
    preallocatePanels(front);
    streamAPI(text, front).catch(err=>{
      toast('Klaida siunčiant žinutę', err?.message || String(err));
      finishWithErrors();
    });
  }

  function stopStream(){ try{ state.currentES && state.currentES.close(); }catch(_){ } state.currentES=null; state.isStreaming=false; el.sendBtn && (el.sendBtn.disabled=false); }
  function hideWelcome(){ if (!el.welcome) return; el.welcome.style.display='none'; }
  function autoGrow(){
    const i = el.messageInput; if (!i) return;
    i.style.height='auto';
    const max = Math.floor(window.innerHeight * 0.40);
    i.style.height = Math.min(i.scrollHeight, max)+'px';
  }

  /* ===== UI burbulai ===== */
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
  const MODEL_ICON = {
    chatgpt:`${ICONS_BASE}/chatgpt.svg`, claude:`${ICONS_BASE}/claude-seeklogo.svg`,
    gemini:`${ICONS_BASE}/gemini.svg`, grok:`${ICONS_BASE}/xAI.svg`,
    deepseek:`${ICONS_BASE}/deepseek.svg`, llama:`${ICONS_BASE}/llama.svg`,
    auto:`${ICONS_BASE}/ai.svg`, paule:`${ICONS_BASE}/ai.svg`, judge:`${ICONS_BASE}/legal-contract.svg`
  };
  const iconOf = id => MODEL_ICON[id] || MODEL_ICON.auto;

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

  function preallocatePanels(frontList){
    state.modelPanels = {}; state.boundPanels = {};
    frontList.forEach(fid=>{
      const cont = addModelBubble(fid, true);
      state.modelPanels[fid] = { element: cont, content: '', completed:false, model: fid, locked:false };
    });
  }
  const takeSlot = () => {
    for (const k of Object.keys(state.modelPanels)){ const r=state.modelPanels[k]; if (r && !r.locked){ r.locked=true; return k; } }
    const gen = 'auto:'+Math.random().toString(36).slice(2,7);
    state.modelPanels[gen] = { element: addModelBubble('auto', true), content:'', completed:false, model:'auto', locked:true };
    return gen;
  };
  function resolveKey(payload){
    const p = payload?.panel || payload?.key; const m = payload?.model;
    if (p && state.boundPanels[p]) return state.boundPanels[p];
    if (m && state.boundPanels[m]) return state.boundPanels[m];
    if (p && state.modelPanels[p]) return p;
    if (m && state.modelPanels[m]) return m;
    return takeSlot();
  }

  /* ===== Stream ===== */
  function splitTransports(front){ const out={stream:[],json:[]}; (front||[]).forEach(fid=>{
    if (fid==='auto'){ out.stream.push('auto'); return; }
    (NON_SSE_FRONT.has(fid)? out.json : out.stream).push(fid);
  }); return out; }
  const buildUrl = qs => {
    const base = normSSE(SSE_ENDPOINT || (API_BASE + '/stream'));
    const u = base + (base.includes('?') ? '&' : '?') + new URLSearchParams(qs).toString();
    return u;
  };

  function streamAPI(message, frontModels, extra={}){
    state.isStreaming = true; el.sendBtn && (el.sendBtn.disabled = true); state.lastRound = {};
    const parts = splitTransports(frontModels||[]); const streamF = parts.stream, jsonF = parts.json;
    const chatId = state.chatId || ('chat_'+Date.now()+'_'+Math.random().toString(36).slice(2)); state.chatId = chatId;
    const base = { message, max_tokens:4096, chat_id:chatId, _t:Date.now(), ...extra };

    state.boundPanels = {}; [...streamF, ...jsonF].forEach(fid => { const back = getBackId(fid); state.boundPanels[fid]=fid; state.boundPanels[back]=fid; });

    let pending = streamF.length + (jsonF.length?1:0);
    const done = ()=>{ pending--; if (pending<=0){ state.isStreaming=false; el.sendBtn && (el.sendBtn.disabled=false); maybeShowDecisionBar(); } };

    // SSE
    streamF.forEach(fid=>{
      const back = getBackId(fid);
      const payload = { ...base, models: back, model: back };
      state.boundPanels[back] = fid;
      addThinking(state.modelPanels[fid]?.element, nameOf(fid));
      const url = buildUrl(payload);
      const es = new EventSource(url);
      state.currentES = es;

      es.addEventListener('start', e=>{ const d=safeJson(e.data); if (d?.chat_id) state.chatId=d.chat_id; });
      es.addEventListener('model_init', e=>{ const d=safeJson(e.data)||{}; d.panel=d.panel||back; state.boundPanels[d.panel]=fid; handleModelInit(d); });
      es.addEventListener('delta', e=>{ const d=safeJson(e.data)||{}; d.panel=d.panel||back; state.boundPanels[d.panel]=fid; applyDelta(d); });
      es.addEventListener('answer', e=>{ const d=safeJson(e.data)||{}; d.panel=d.panel||back; state.boundPanels[d.panel]=fid; applyAnswer(d); });
      es.addEventListener('model_done', e=>{ const d=safeJson(e.data)||{}; d.panel=d.panel||back; const k=resolveKey(d); const r=state.modelPanels[k]; if(r){ r.completed=true; rmThinking(r.element); } });
      es.addEventListener('done', ()=>{ try{es.close();}catch(_){} if (state.currentES===es) state.currentES=null; done(); });
      es.onerror = ()=>{ try{es.close();}catch(_){ } postOnce({ ...base, models: back, model: back }, [back]).finally(done); };
    });

    // JSON (grupė vienu POST)
    if (jsonF.length) postOnce(base, jsonF.map(getBackId)).finally(done);

    return Promise.resolve();
  }

  function postOnce(basePayload, backModels){
    const base = normSSE(SSE_ENDPOINT || (API_BASE + '/stream'));
    const url  = base + (base.includes('?') ? '&' : '?') + 'mode=once';
    return fetch(url, { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ ...basePayload, models: backModels.join(','), mode:'once' }) })
      .then(async res=>{ if (!res.ok){ const t=await res.text().catch(()=>'' ); throw new Error('HTTP '+res.status+' '+t); } return res.json(); })
      .then(data=>{
        (data.answers||[]).forEach((ans,idx)=>{
          const real = ans.model || backModels[idx] || backModels[0] || 'auto';
          const front = Object.keys(FRONT_TO_BACK).find(k=>FRONT_TO_BACK[k]===real) || real;
          const panel = state.boundPanels[real] || front;
          applyAnswer({ model: front, panel, text: ans.text||'' });
        });
      })
      .catch(e=> toast('Nepavyko gauti atsakymo', e.message||String(e)));
  }

  function handleModelInit(d){
    const key = resolveKey(d||{}); const rec = state.modelPanels[key]; if (!rec) return;
    const front = (d.model && (Object.keys(FRONT_TO_BACK).find(k=>FRONT_TO_BACK[k]===d.model) || d.model)) || rec.model || 'auto';
    rec.model = (front==='augam-auto'?'auto':front);
    const bubble = rec.element?.closest('.bubble'); bubble && bubble.setAttribute('data-model', rec.model);
    const card = rec.element?.closest('.bubble-card'); const meta = card?.querySelector('.msg-meta span'); if (meta) meta.textContent = nameOf(rec.model);
    const av = bubble?.previousElementSibling?.querySelector('img'); if (av) av.src = iconOf(rec.model);
  }

  function applyDelta(payload){
    const key = resolveKey(payload||{}); let rec = state.modelPanels[key];
    const txt = String(payload?.text || payload?.delta || payload?.content || ''); if (!rec || !txt) return;
    rmThinking(rec.element);
    rec.content += txt;
    rec.element.innerHTML = parseMarkdown(rec.content);
    scrollToBottomIfNeeded();
  }
  function applyAnswer(payload){
    const key = resolveKey(payload||{}); let rec = state.modelPanels[key];
    const front = (payload?.model || rec?.model || 'auto'); const txt = String(payload?.text || payload?.answer || payload?.content || '');
    if (!rec){
      const elc = addModelBubble(front, false, txt);
      rec = state.modelPanels[key] = { element: elc, content: txt, completed:true, model: front, locked:true };
    } else {
      rec.content = txt; rec.completed = true; rmThinking(rec.element); rec.element.innerHTML = parseMarkdown(rec.content);
    }
    const back = getBackId(front); state.lastRound[back] = rec.content;

    // Kai tik gaunam pirmą pilną atsakymą – parodom sprendimų juostą
    maybeShowDecisionBar();
    scrollToBottomIfNeeded();
  }

  function maybeShowDecisionBar(){
    if (state.decisionBarShown) return;
    if (!el.decisionBar) return;
    const hasAny = Object.keys(state.lastRound||{}).length>0;
    if (hasAny){
      el.decisionBar.style.display='flex';
      state.decisionBarShown = true;
    }
  }

  /* ===== Sprendimų režimai ===== */
  function startDebate(){
    addSystemMessage('🔁 Pradedamas AI ginčas – kiekvienas modelis pateiks savo **3–5 argumentus**.');
    const front = getActiveFront();
    const prompt = state.lastUserText ?
      `${state.lastUserText}\n\nREŽIMAS: GINČAS.\nInstrukcija: Pateik 3–5 stipriausius argumentus, kodėl tavo siūlomas atsakymas/planas yra geriausias. Struktūra: • Argumentas • Įrodymas • Rizika.` :
      'AI ginčas: pateik argumentus.';
    preallocatePanels(front);
    streamAPI(prompt, front, { augam_role:'debate' });
  }

  function startCompromise(){
    const answers = Object.entries(state.lastRound||{}).map(([model,txt])=>`[${model}]: ${txt}`).join('\n\n');
    if (!answers){ toast('Trūksta atsakymų', 'Pirmiausia gauti bent vieną modelio atsakymą.'); return; }
    addSystemMessage('🤝 Kompromisas: suderiname modelių atsakymus į vieną planą.');
    const prompt = `Žemiau – keli skirtingų modelių atsakymai.\nSujunk į vieną **realistišką ir detalų** sprendimą (su žingsniais, rizikomis, KPI ir „next actions“).\n\n${answers}\n\nGrąžink: • Santrauka • Vieningas sprendimas • 3 KPI • Pirmi 5 žingsniai.`;
    preallocatePanels(['auto']);
    streamAPI(prompt, ['auto'], { augam_role:'compromise' });
  }

  function startJudge(){
    const answers = Object.entries(state.lastRound||{}).map(([model,txt])=>`[${model}]: ${txt}`).join('\n\n');
    if (!answers){ toast('Trūksta atsakymų', 'Pirmiausia gauti bent vieną modelio atsakymą.'); return; }
    addSystemMessage('⚖️ Teisėjas vertina atsakymus…');

    // Sukuriam specialų „Teisėjo“ burbulą, bet siunčiam užkulisiuose į Llama
    const judgeKey = 'judge';
    const cont = addModelBubble('judge', true);
    state.modelPanels = { [judgeKey]: { element: cont, content:'', completed:false, model:'judge', locked:true } };
    state.boundPanels = {}; // izoliuojam kad atsakymas nueitų į šį panelį

    const prompt = `Tu esi profesionalus „Teisėjas“.\nĮvertink pateiktus atsakymus ir parink **teisingiausią/naudingiausią**.\nGrąžink: • Verdiktas (vienas) • Kodėl • Kurio modelio idėja pasirinkta • 2 silpnybės kitų variantų • Galutinis aiškus planas.\n\n${answers}`;
    streamAPI(prompt, ['llama'], { augam_role:'judge' });
  }

  /* ===== UI helpers ===== */
  function addThinking(container, modelName){
    if (!container) return;
    container.innerHTML = `<div class="thinking"><div class="loading-dots"><span></span><span></span><span></span></div>
      <span style="margin-left:12px;opacity:.7">${escapeHtml(modelName)} analizuoja…</span></div>`;
  }
  function rmThinking(container){
    if (!container) return;
    const t = container.querySelector('.thinking'); if (t){ t.style.opacity='0'; t.style.transition='opacity .25s'; setTimeout(()=>t.remove(), 240); }
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

  /* ===== Feeds (Dainos/Nuotraukos/Video) ===== */
  function startFeedsAutoRefresh(){
    refreshFeeds(); setInterval(refreshFeeds, 6000);
  }
  function refreshFeeds(){
    // Tikimės /api/library/recent?limit=3 grąžina { songs:[{title,url,cover}], photos:[{title,url}], videos:[{title,thumb}] }
    fetch((API_BASE||'/api') + '/library/recent?limit=3').then(r=>r.json()).then(data=>{
      try{ fillFeed(el.songsFeed, data.songs, '/assets/hero/music.webp'); }catch(_){}
      try{ fillFeed(el.photosFeed, data.photos, '/assets/hero/photo.webp'); }catch(_){}
      try{ fillFeed(el.videosFeed, data.videos, '/assets/hero/video.webp'); }catch(_){}
    }).catch(_=>{
      // tylus fallback – paliekam placeholder’ius
    });
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

  /* ===== Helpers ===== */
  function timeNow(){ return new Date().toLocaleTimeString('lt-LT',{hour:'2-digit',minute:'2-digit'}); }
  function escapeHtml(x){ const d=document.createElement('div'); d.textContent=(x==null?'':String(x)); return d.innerHTML; }
  function safeJson(s){ try{ return JSON.parse(s); }catch(_){ return null; } }
  function parseMarkdown(s){
    let t = escapeHtml(String(s || ''));
    t = t.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
    t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    t = t.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    t = t.replace(/\n/g, '<br>');
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

  window.PauleMain = { state, sendMessage, startDebate, startCompromise, startJudge };

})();
