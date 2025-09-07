/* =======================================================================
   Paule – Premium Chat (Vercel)
   Pagrindinis UI/transporto klientas be WP, be „augam“.
   API bazė ir maršrutai imami iš window.PAULE_CONFIG (žr. index.html).
   ======================================================================= */ 
(function () {
  'use strict';

  /* ---------- U shim (saugiam konsolės stekinimui) ---------- */
  (function(){ 
    try { 
      window.U = window.U || {}; 
      if (!Array.isArray(window.U.stack)) window.U.stack = []; 
    } catch(_){}
  })();

  /* =========================================================
     0) BAZINIAI KELIAI (tik Vercel /api/*, be WP)
     ========================================================= */
  function _rtrim(s){ return String(s||'').replace(/\/+$/,''); }
  function _isStreamUrl(u){ return /\/stream(?:\?|$)/.test(String(u||'')); }

  var ORIGIN = (window.location && window.location.origin)
    ? _rtrim(window.location.origin)
    : 'https://paule.vercel.app';

  // Numatytos bazės (gali būti perrašytos iš PAULE_CONFIG)
  var PLUGIN_BASE   = '/assets';
  var FEATURES_BASE = '/assets/features';
  var ICONS_BASE    = '/assets/icon';
  var API_BASE      = '/api';
  var SSE_ENDPOINT  = API_BASE + '/stream';

  if (window.PAULE_CONFIG) {
    var C = window.PAULE_CONFIG;
    if (C.pluginBase)   PLUGIN_BASE   = _rtrim(C.pluginBase);
    if (C.featuresBase) FEATURES_BASE = _rtrim(C.featuresBase);
    if (C.iconsBase)    ICONS_BASE    = _rtrim(C.iconsBase);

    // Bazė ir trasos
    if (C.restBase)       API_BASE     = _rtrim(C.restBase);
    if (C.restStreamSSE)  SSE_ENDPOINT = _rtrim(C.restStreamSSE);
    else if (C.restStream)SSE_ENDPOINT = _rtrim(C.restStream);
  }

  // Jei nori naudoti /stream vietoje /stream?mode=sse
  function normalizeSSEEndpoint(s){
    if (!s) return API_BASE + '/stream';
    return String(s).replace(/\/stream-sse(?:\?.*)?$/,'/stream');
  }

  /* =========================================================
     1) KONFIGŪRA (be nonce, be WP)
     ========================================================= */
  var DEBUG = false;

  // Front → Back žemėlapis (trumpi ID UI ↔ ilgų pavadinimų back-end)
  var FRONT_TO_BACK = {
    auto:    'auto',
    chatgpt: 'gpt-4o-mini',
    claude:  'claude-4-sonnet',
    gemini:  'gemini-2.5-flash',
    grok:    'grok-4',
    deepseek:'deepseek-chat',
    llama:   'meta-llama/Llama-4-Scout-17B-16E-Instruct'
  };
  function getBackendModelId(front){ return FRONT_TO_BACK[front] || front || 'auto'; }

  // Modelių pavadinimai UI
  var MODEL_NAME = {
    auto:'Auto',
    chatgpt:'ChatGPT',
    claude:'Claude',
    gemini:'Gemini',
    grok:'Grok',
    deepseek:'DeepSeek',
    llama:'Llama',
    // back-end ID atvejui
    'gpt-4o-mini':'ChatGPT',
    'claude-4-sonnet':'Claude',
    'gemini-2.5-flash':'Gemini',
    'grok-4':'Grok',
    'deepseek-chat':'DeepSeek',
    'meta-llama/Llama-4-Scout-17B-16E-Instruct':'Llama'
  };
  function nameOf(id){ return MODEL_NAME[id] || id; }

  // Kurie modeliai be SSE (tik JSON POST kartą)
  var NON_SSE_MODELS = new Set(['claude','grok','gemini',
                                'claude-4-sonnet','grok-4','gemini-2.5-flash']);

  // Final CONFIG (paimama iš window.PAULE_CONFIG, jei yra)
  window.CONFIG = (function () {
    var base = window.PAULE_CONFIG || {};
    var cfg = {
      restModels:      _rtrim(base.routes?.models || API_BASE + '/models'),
      restStream:      _rtrim(base.routes?.stream || API_BASE + '/stream'),
      restStreamSSE:   _rtrim((base.restStreamSSE || (API_BASE + '/stream?mode=sse'))),
      restDiagnostics: _rtrim(base.routes?.diagnostics || API_BASE + '/diagnostics'),
      restFluxCreate:  _rtrim(base.routes?.fluxCreate || API_BASE + '/flux/create'),
      restComicCreate: _rtrim(base.routes?.comicCreate || API_BASE + '/comic/create'),

      restRunwayImage: _rtrim(base.routes?.runwayImage || API_BASE + '/runway/image'),
      restRunwayStatus:_rtrim(base.routes?.runwayStatus|| API_BASE + '/runway/status'),

      restMusicCreate: _rtrim(base.routes?.musicCreate || API_BASE + '/music/create'),
      restMusicStatus: _rtrim(base.routes?.musicStatus || API_BASE + '/music/status'),

      version:         base.version || 'paule-1.0.0',
      sseDefault:      (typeof base.sseDefault==='number') ? base.sseDefault : 1
    };
    return cfg;
  })();

  // Kurį srautą naudoti pagal CONFIG
  try {
    if (window.CONFIG.sseDefault) {
      SSE_ENDPOINT = window.CONFIG.restStreamSSE || (API_BASE + '/stream?mode=sse');
    } else {
      SSE_ENDPOINT = window.CONFIG.restStream || (API_BASE + '/stream');
    }
  } catch(_) {}

  if (DEBUG) {
    try { console.log('[PAULE][CONFIG]', window.CONFIG, 'SSE=', SSE_ENDPOINT); } catch(_){}
  }

  /* =========================================================
     2) BŪSENA
     ========================================================= */
  var state = {
    theme: getInitialTheme(),
    selectedModels: ['auto'],
    isStreaming: false,
    chatId: null,
    lastUserText: '',
    lastRound: {},                 // { backendModelId: content }
    stats: {
      gpt: { wins: 37, total: 42 },
      claude: { wins: 35, total: 38 },
      deepseek: { wins: 19, total: 25 },
      llama: { wins: 48, total: 51 },
      grok: { wins: 16, total: 19 },
      gemini: { wins: 30, total: 34 }
    },
    chatPhase: 'initial',
    modelElements: {},             // key -> { element, content, model, ... }
    currentEventSource: null,
    availableModels: [],
    hasMessagesStarted: false,
    debugMode: DEBUG,
    specialistMode: false,
    currentSpecialist: null,
    user: null,
    currentProject: null,
    chatHistory: [],
    stickToBottom: true,
    debateButtonsShown: false
  };

  /* =========================================================
     3) DOM
     ========================================================= */
  var elements = {
    modelList: document.getElementById('modelsBar'),             // <nav id="modelsBar">
    chatArea: document.getElementById('chatArea'),
    welcome: document.getElementById('welcome'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    sidebar: document.getElementById('sidebar'),
    btnMobile: document.getElementById('btnMobile'),
    btnNewChat: document.getElementById('btnNewChat'),
    btnLogin: document.getElementById('btnLogin'),
    userProfile: document.getElementById('userProfile'),
    profileDropdown: document.getElementById('profileDropdown'),
    specialistGrid: document.querySelector('.specialist-grid'),
    mobileOverlay: document.getElementById('mobileOverlay'),
    bottomSection: document.getElementById('bottomSection'),
    projectsList: document.getElementById('projectsList'),
    historyList: document.getElementById('historyList')
  };

  /* =========================================================
     4) INIT
     ========================================================= */
  function initialize() {
    try {
      if (isTestMode()) runSelfTestUI();

      clearDemoSeeds();
      applyTheme();
      wireEvents();
      updateStatsDisplay();
      setInitialModelSelection();
      loadAvailableModels();
      updateBottomSectionPosition();
      initializeWelcomeActions();
      initializeUserAuth();
      loadProjects();
      seedChatHistory();
      loadAllFeatureModules();
      initializeCreativeModules();
    } catch (error) {
      console.error('[PAULE] Initialization error:', error);
      showErrorNotification('Klaida inicializuojant aplikaciją: ' + error.message);
    }
  }

  function clearDemoSeeds() {
    try {
      if (elements.chatArea) {
        var demoMsgs = elements.chatArea.querySelectorAll('.message, .thinking');
        if (demoMsgs.length) elements.chatArea.innerHTML = '';
      }
    } catch (e) { console.warn('[PAULE] clearDemoSeeds warn:', e); }
  }

  /* =========================================================
     5) MODULIAI (popup’ai)
     ========================================================= */
  function loadAllFeatureModules() {
    ['specialist-overlay', 'music', 'photo', 'video', 'file'].forEach(loadFeatureModule);
  }
  function loadFeatureModule(moduleName) {
    var url = FEATURES_BASE + '/' + moduleName + '.html';
    fetch(url, { cache: 'no-store' })
      .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); })
      .then(function (html) {
        var containerId = moduleName === 'specialist-overlay' ? 'specialistContainer' : 'creativeContainer';
        var container = document.getElementById(containerId) || document.body;
        container.insertAdjacentHTML('beforeend', html);
      })
      .catch(function () { /* neprivaloma */ });
  }
  function initializeCreativeModules() {
    var startedAt = Date.now();
    var timer = setInterval(function () {
      var needed = ['musicPopup', 'photoPopup', 'videoPopup', 'filePopup'];
      var loaded = 0;
      for (var i = 0; i < needed.length; i++) if (document.getElementById(needed[i])) loaded++;
      if (loaded >= needed.length) { clearInterval(timer); return; }
      if (Date.now() - startedAt > 5000) { clearInterval(timer); createFallbackModules(); }
    }, 400);
  }
  function createFallbackModules() {
    var cfgs = [
      { id: 'musicPopup', title: 'Muzikos studija' },
      { id: 'photoPopup', title: 'Foto studija' },
      { id: 'videoPopup', title: 'Video studija' },
      { id: 'filePopup', title: 'Failų analizė' }
    ];
    cfgs.forEach(function (cfg) {
      if (!document.getElementById(cfg.id)) {
        var wrapper = document.createElement('div');
        wrapper.id = cfg.id;
        wrapper.className = 'creative-popup';
        wrapper.innerHTML =
          '<div class="popup-overlay">' +
          '<div class="popup-content">' +
          '<div class="popup-header">' +
          '<h2>' + cfg.title + '</h2>' +
          '<button class="popup-close" onclick="this.closest(\'.creative-popup\').classList.remove(\'active\')">×</button>' +
          '</div>' +
          '<div class="popup-body">' +
          '<p>Funkcija dar kuriama arba modulis neįkeltas.</p>' +
          '<button class="btn-primary" onclick="this.closest(\'.creative-popup\').classList.remove(\'active\')">Uždaryti</button>' +
          '</div>' +
          '</div>' +
          '</div>';
        document.body.appendChild(wrapper);
      }
    });
  }

  /* =========================================================
     6) TEMA
     ========================================================= */
  function getInitialTheme() {
    try {
      var saved = localStorage.getItem('paule_theme');
      if (saved && saved !== 'auto') return saved;
      var hour = new Date().getHours();
      return (hour >= 20 || hour < 7) ? 'dark' : 'light';
    } catch (e) { return 'light'; }
  }
  function applyTheme() { (document.documentElement || document.body).setAttribute('data-theme', state.theme); }
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('paule_theme', state.theme); } catch (_) {}
    applyTheme();
    document.body.style.transition = 'all 0.3s ease';
    setTimeout(function () { document.body.style.transition = ''; }, 300);
  }

  /* =========================================================
     7) EVENT’AI
     ========================================================= */
  function wireEvents() {
    // Login (CSS modal #auth)
    if (elements.btnLogin) elements.btnLogin.addEventListener('click', function(){
      location.hash = '#auth';
    });

    // Profilio dropdown (jei atsirastų)
    if (elements.userProfile) elements.userProfile.addEventListener('click', function (e) {
      e.stopPropagation();
      if (elements.profileDropdown) elements.profileDropdown.classList.toggle('active');
    });
    document.addEventListener('click', function () {
      if (elements.profileDropdown) elements.profileDropdown.classList.remove('active');
    });

    // Naujas pokalbis
    if (elements.btnNewChat) elements.btnNewChat.addEventListener('click', function () {
      elements.btnNewChat.style.transform = 'scale(0.95)';
      setTimeout(function () { location.reload(); }, 100);
    });

    // Mobile sidebar
    if (elements.btnMobile) elements.btnMobile.addEventListener('click', function () {
      if (elements.sidebar && elements.sidebar.classList.contains('open')) closeSidebar(); else openSidebar();
    });

    // Žinutės
    if (elements.sendBtn) elements.sendBtn.addEventListener('click', sendMessage);
    if (elements.messageInput) {
      elements.messageInput.addEventListener('keydown', handleInputKeydown);
      elements.messageInput.addEventListener('input', autoResizeInput);
    }

    // Specialistai
    if (elements.specialistGrid) elements.specialistGrid.addEventListener('click', handleSpecialistClick);

    // Modeliai
    if (elements.modelList) elements.modelList.addEventListener('click', handleModelClick);

    // Įrankių juosta (apačioje)
    var tbar = document.querySelector('.tools-bar');
    if (tbar) tbar.addEventListener('click', handleToolClick);

    // Window
    window.addEventListener('resize', updateBottomSectionPosition);

    // Shortcut’ai
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'k': e.preventDefault(); elements.messageInput && elements.messageInput.focus(); break;
          case 'n': e.preventDefault(); location.reload(); break;
          case 'd': e.preventDefault(); toggleTheme(); break;
          case 'l': e.preventDefault(); state.user ? handleLogout() : (location.hash='#auth'); break;
        }
      }
      if (e.key === 'Enter' && !e.shiftKey && document.activeElement === elements.messageInput) {
        e.preventDefault(); sendMessage();
      }
      if (e.key === 'Escape') {
        if (elements.profileDropdown) elements.profileDropdown.classList.remove('active');
        var opened = document.querySelectorAll('.creative-popup.active');
        for (var i = 0; i < opened.length; i++) opened[i].classList.remove('active');
      }
    });
  }

  function closeSidebar() {
    if (elements.sidebar) elements.sidebar.classList.remove('open');
    if (elements.mobileOverlay) elements.mobileOverlay.classList.remove('active');
  }
  function openSidebar() {
    if (elements.sidebar) elements.sidebar.classList.add('open');
    if (elements.mobileOverlay) elements.mobileOverlay.classList.add('active');
  }

  function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }
  function autoResizeInput() {
    var input = elements.messageInput; if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 120) + 'px';
  }

  /* =========================================================
     8) SPECIALISTAI
     ========================================================= */
  function handleSpecialistClick(e) {
    var chip = e.target.closest('[data-route]'); if (!chip) return;
    if (window.innerWidth <= 1024) closeSidebar();
    var chips = elements.specialistGrid ? elements.specialistGrid.querySelectorAll('.chip') : [];
    for (var i = 0; i < chips.length; i++) chips[i].classList.remove('active');
    chip.classList.add('active');
    addSystemMessage('Specialisto langas atidaromas (modulis turi būti įkeltas).');
  }

  /* =========================================================
     9) MODELIAI
     ========================================================= */
  function handleModelClick(e) {
    var pill = e.target.closest('.model-pill'); if (!pill) return;
    var id = pill.getAttribute('data-model');

    if (id === 'auto') {
      // tik auto
      var pills = elements.modelList ? elements.modelList.querySelectorAll('.model-pill') : [];
      for (var i = 0; i < pills.length; i++) pills[i].classList.remove('active');
      pill.classList.add('active');
      state.selectedModels = ['auto'];
      updateModelSelectionDisplay();
      return;
    }

    // jei pasirenkam konkretų – „auto“ išjungiame
    var autoPill = elements.modelList && elements.modelList.querySelector('.model-pill[data-model="auto"]');
    if (autoPill) autoPill.classList.remove('active');

    pill.classList.toggle('active');
    var active = [];
    var act = elements.modelList ? elements.modelList.querySelectorAll('.model-pill.active') : [];
    for (var j = 0; j < act.length; j++) {
      var mid = act[j].getAttribute('data-model');
      if (mid && mid !== 'auto') active.push(mid);
    }
    if (!active.length) {
      if (autoPill) autoPill.classList.add('active');
      state.selectedModels = ['auto'];
    } else {
      state.selectedModels = active;
    }
    updateModelSelectionDisplay();
  }

  function updateModelSelectionDisplay() {
    var isAuto = state.selectedModels.length === 1 && state.selectedModels[0] === 'auto';
    var txt = isAuto ? 'Auto (Llama 4 Scout)' : 'Pasirinkti: ' + state.selectedModels.map(nameOf).join(', ');
    try { console.log('[PAULE]', txt); } catch (_) {}
  }
  function getActiveModels() {
    if (state.selectedModels.indexOf('auto') !== -1 || state.selectedModels.length === 0) return ['auto'];
    return state.selectedModels.slice();
  }

  /* =========================================================
     10) ĮRANKIAI (popup’ai)
     ========================================================= */
  function handleToolClick(e) {
    var tool = e.target.closest('.tool'); if (!tool) return;
    var toolType = tool.getAttribute('data-tool');
    var tools = document.querySelectorAll('.tool'); for (var i=0;i<tools.length;i++) tools[i].classList.remove('active');
    tool.classList.add('active');

    switch (toolType) {
      case 'song': openCreativePopup('musicPopup'); break;
      case 'photo': openCreativePopup('photoPopup'); break;
      case 'mindmap': openCreativePopup('videoPopup'); break;
      case 'file': openCreativePopup('filePopup'); break;
      default: addSystemMessage(toolType + ' įrankis dar kuriamas');
    }
    if (window.innerWidth <= 1024) closeSidebar();
  }
  function openCreativePopup(id){
    var p = document.getElementById(id);
    if (p) p.classList.add('active'); else showErrorNotification('Modulis dar neįkeltas.');
  }

  /* =========================================================
     11) ŽINUTĖS / STREAM
     ========================================================= */
  function sendMessage() {
    if (!elements.messageInput) return;
    var text = (elements.messageInput.value || '').trim();
    if (!text) return;

    if (state.isStreaming) stopStreaming();

    state.lastUserText = text;
    if (!state.hasMessagesStarted) { state.hasMessagesStarted = true; updateBottomSectionPosition(); }
    hideWelcome();

    addUserMessage(text);
    elements.messageInput.value = '';
    autoResizeInput();
    if (window.innerWidth <= 1024) closeSidebar();

    var selectedModels = getActiveModels();
    preallocateModelPanels(selectedModels);
    streamRealAPI(text, selectedModels).catch(function (err) {
      showErrorNotification('Klaida siunčiant žinutę', (err && err.message) ? err.message : String(err || ''));
      finishWithErrors();
    });
  }

  function stopStreaming() {
    try { if (state.currentEventSource) state.currentEventSource.close(); } catch (_) {}
    state.currentEventSource = null;
    state.isStreaming = false;
    if (elements.sendBtn) elements.sendBtn.disabled = false;
  }

  function hideWelcome() {
    if (!elements.welcome) return;
    elements.welcome.style.opacity = '0';
    elements.welcome.style.transform = 'translateY(-20px)';
    setTimeout(function () {
      if (elements && elements.welcome && elements.welcome.parentNode) elements.welcome.remove();
    }, 300);
  }

  function addUserMessage(text) {
    if (!elements.chatArea) return null;
    var msg = document.createElement('div');
    msg.className = 'message user';
    msg.innerHTML =
      '<div class="avatar"><img src="' + ICONS_BASE + '/mine.svg" alt="" style="width:18px;height:18px"></div>' +
      '<div class="bubble user"><div class="bubble-card">' +
      '<div class="msg-content">' + escapeHtml(text) + '</div>' +
      '<div class="msg-meta"><span>' + (state.user && state.user.name ? state.user.name : 'Jūs') + '</span>' +
      '<span>' + getCurrentTime() + '</span></div>' +
      '</div></div>';
    fadeInAppend(msg);
    scrollToBottomIfNeeded();
    return msg;
  }

  var MODEL_ICON = {
    chatgpt: ICONS_BASE + '/chatgpt.svg',
    claude:  ICONS_BASE + '/claude-seeklogo.svg',
    gemini:  ICONS_BASE + '/gemini.svg',
    grok:    ICONS_BASE + '/xAI.svg',
    deepseek:ICONS_BASE + '/deepseek.svg',
    llama:   ICONS_BASE + '/llama.svg'
  };
  function iconOf(modelFrontOrBack) {
    var f = Object.keys(FRONT_TO_BACK).find(function(k){ return FRONT_TO_BACK[k] === modelFrontOrBack; });
    var key = f || modelFrontOrBack;
    return MODEL_ICON[key] || (ICONS_BASE + '/ai.svg');
  }

  function addSpecialistMessage(opts) {
    opts = opts || {};
    var model = opts.model || 'auto';            // front ID
    var streaming = !!opts.streaming;
    var label = opts.label || nameOf(model);
    var content = opts.content || '';
    var parsed = streaming ? '' : parseMarkdown(content);

    if (!elements.chatArea) return null;
    var wrapper = document.createElement('div');
    wrapper.className = 'message';
    wrapper.innerHTML =
      '<div class="avatar"><img src="' + iconOf(model) + '" alt="" style="width:18px;height:18px"></div>' +
      '<div class="bubble" data-model="' + (model || '') + '">' +
        '<div class="bubble-card">' +
          '<button class="copy-btn" title="Kopijuoti" ' +
            'onclick="(function(btn){var card=btn.closest(\\\'.bubble-card\\\');var mc=card?card.querySelector(\\\'.msg-content\\\'):null;var t=mc?mc.innerText:\\\'\\\';try{navigator.clipboard.writeText(t);btn.classList.add(\\\'ok\\\');setTimeout(function(){btn.classList.remove(\\\'ok\\\');},900);}catch(e){}})(this)" ' +
            'style="position:absolute;right:8px;top:8px;font-size:12px;border:1px solid var(--border);background:var(--bg);padding:4px 6px;border-radius:6px;cursor:pointer;opacity:.8">⧉</button>' +
          '<div class="msg-content">' + parsed + '</div>' +
          '<div class="msg-meta"><span>' + escapeHtml(label) + '</span><span>' + getCurrentTime() + '</span>' +
            (streaming ? '<span class="typing"><span></span><span></span><span></span></span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';
    fadeInAppend(wrapper);
    scrollToBottomIfNeeded();
    return wrapper.querySelector('.msg-content');
  }

  /* ---- iš anksto rezervuojame paneles pasirinktiems modeliams ---- */
  function preallocateModelPanels(models) {
    state.modelElements = {};
    state._pendingModelQueue = [];
    state._boundPanels = {};

    (models || []).forEach(function (frontId) {
      var el = addSpecialistMessage({ model: frontId, streaming: true, label: nameOf(frontId) });
      state.modelElements[frontId] = { element: el, content: '', completed: false, key: frontId, model: frontId, _locked: false };
      state._pendingModelQueue.push(frontId);
    });
  }
  function takeNextUnboundModelKey() {
    for (var i = 0; i < state._pendingModelQueue.length; i++) {
      var k = state._pendingModelQueue[i];
      var rec = state.modelElements[k];
      if (rec && !rec._locked) { rec._locked = true; return k; }
    }
    var el = addSpecialistMessage({ model: 'auto', streaming: true, label: nameOf('auto') });
    var genKey = 'auto:' + Math.random().toString(36).slice(2, 7);
    state.modelElements[genKey] = { element: el, content: '', completed: false, key: genKey, model: 'auto', _locked: true };
    return genKey;
  }
  function resolveTargetKey(payload) {
    var p = payload && (payload.panel || payload.key);
    var m = payload && payload.model;
    if (p && state._boundPanels && state._boundPanels[p]) return state._boundPanels[p];
    if (m && state._boundPanels && state._boundPanels[m]) return state._boundPanels[m];
    if (p && state.modelElements && state.modelElements[p]) return p;
    if (m && state.modelElements && state.modelElements[m]) return m;
    return takeNextUnboundModelKey();
  }

  /* =========================================================
     12) REALI API – SSE + POST (per-model)
     ========================================================= */
  var SSE_DEBUG = false;
  var SSE_WATCHDOG_MS = 9000;
  function sselog(){ try{ if (SSE_DEBUG) console.log.apply(console, ['[SSE]'].concat([].slice.call(arguments))); }catch(_){ } }

  function splitModelsByTransport(frontModels){
    var out = { stream: [], json: [] };
    (frontModels || []).forEach(function(fid){
      if (!fid) return;
      if (fid === 'auto') { out.stream.push(fid); return; }
      if (NON_SSE_MODELS.has(fid)) out.json.push(fid); else out.stream.push(fid);
    });
    return out;
  }

  function buildStreamUrl(qsObj){
    var base = normalizeSSEEndpoint(SSE_ENDPOINT || (API_BASE + '/stream'));
    var qs = new URLSearchParams(qsObj || {}).toString();
    return base + (base.indexOf('?') === -1 ? '?' : '&') + qs;
  }

  function openSSE(url, handlers){
    sselog('OPEN', url);
    if (window.EventSource) {
      var es = new EventSource(url, { withCredentials: false });
      es.onmessage = function(e){ try { handlers && handlers.message && handlers.message(e); } catch(_){} };
      ['start','model_init','delta','answer','model_done','done','error'].forEach(function(evt){
        if (handlers && typeof handlers[evt] === 'function') es.addEventListener(evt, handlers[evt]);
      });
      es.onerror = handlers && handlers.error ? handlers.error : function(e){ sselog('ERROR', e); };
      return { close: function(){ try{ es.close(); }catch(_){ } } };
    }
    try { handlers && handlers.error && handlers.error(new Error('EventSource not available')); } catch(_){}
    return { close: function(){} };
  }

  function applyDeltaRecordFromPayload(payload) {
    var key = resolveTargetKey(payload || {});
    var rec = state.modelElements[key];

    if (!rec) {
      var mdlFront = payload && payload.model ? payload.model : 'auto';
      var el = addSpecialistMessage({ model: mdlFront, streaming: true, label: nameOf(mdlFront) });
      rec = state.modelElements[key] = { element: el, content: '', completed: false, key: key, model: mdlFront, _locked: true };
    }

    var txt = (payload && (payload.text || payload.delta || payload.content)) || '';
    if (!txt) return rec;

    removeLoadingIndicator(rec.element);
    rec.content += String(txt);
    rec.element.innerHTML = parseMarkdown(rec.content);
    scrollToBottomIfNeeded();
    return rec;
  }

  function applyAnswerRecordFromPayload(payload) {
    var key = resolveTargetKey(payload || {});
    var rec = state.modelElements[key];
    var txt = String((payload && (payload.text || payload.answer || payload.delta || payload.content)) || '');
    var frontModel = payload && payload.model ? payload.model : (rec && rec.model) || key || 'auto';

    if (!rec) {
      var el = addSpecialistMessage({ model: frontModel, streaming: false, label: nameOf(frontModel), content: txt });
      rec = state.modelElements[key] = { element: el, content: txt, completed: true, key: key, model: frontModel, _locked: true };
    } else {
      rec.content = txt;
      rec.completed = true;
      removeLoadingIndicator(rec.element);
      rec.element.innerHTML = parseMarkdown(rec.content);
    }

    var card = rec.element.closest('.bubble-card');
    if (card) { var t = card.querySelector('.typing'); if (t) t.remove(); }

    // įrašome pagal BACK id
    var backId = getBackendModelId(frontModel);
    state.lastRound[backId] = rec.content;

    scrollToBottomIfNeeded();
    return rec;
  }

  function handleModelInit(d){
    var key = resolveTargetKey(d || {});
    var rec = state.modelElements[key];
    if (!rec) return;

    var front = d.model || rec.model || key || 'auto';
    rec.model = front;

    var bubble = rec.element.closest('.bubble');
    if (bubble) bubble.setAttribute('data-model', front);

    var card = rec.element.closest('.bubble-card');
    if (card) {
      var metaFirst = card.querySelector('.msg-meta span');
      if (metaFirst) metaFirst.textContent = nameOf(front);
    }
    var avatar = bubble ? bubble.previousElementSibling : null;
    if (avatar && avatar.querySelector('img')) avatar.querySelector('img').src = iconOf(front);
  }

  function finishWithErrors() {
    Object.keys(state.modelElements).forEach(function (k) {
      var rec = state.modelElements[k];
      if (!rec) return;
      removeLoadingIndicator(rec.element);
      if (!rec.completed && !rec.content) {
        rec.element.innerHTML = '<em style="color: var(--error);">Nepavyko gauti atsakymo</em>';
      }
    });
  }

  function streamRealAPI(message, models, specialistConfig) {
    state.isStreaming = true;
    state.debateButtonsShown = false;
    if (elements.sendBtn) elements.sendBtn.disabled = true;
    state.lastRound = {};

    var parts = splitModelsByTransport(models || []);
    var streamFront = parts.stream;
    var jsonFront   = parts.json;

    var chatId = state.chatId || ('chat_' + Date.now() + '_' + Math.random().toString(36).slice(2));
    state.chatId = chatId;

    var basePayload = {
      message: specialistConfig ? (specialistConfig.systemPrompt + '\n\n' + message) : message,
      max_tokens: 4096,
      chat_id: chatId,
      _t: Date.now()
    };

    state._boundPanels = state._boundPanels || {};
    (streamFront.concat(jsonFront)).forEach(function(frontId){
      var backId = getBackendModelId(frontId);
      state._boundPanels[frontId] = frontId;
      state._boundPanels[backId]  = frontId;
    });

    var totalTasks = streamFront.length + jsonFront.length;
    if (!totalTasks) {
      state.isStreaming = false;
      if (elements.sendBtn) elements.sendBtn.disabled = false;
      return Promise.resolve({ ok: true });
    }
    function markDone(){
      totalTasks--;
      if (totalTasks <= 0){
        state.isStreaming = false;
        if (elements.sendBtn) elements.sendBtn.disabled = false;
        // po visko – galime rodyti ginčo veiksmus (jei norėsi)
      }
    }

    var tasks = [];

    // SSE – po 1 srautą kiekvienam
    streamFront.forEach(function(frontId){
      var real = getBackendModelId(frontId);
      var payloadSSE = Object.assign({}, basePayload, { models: real, model: real });
      state._boundPanels[real] = frontId;

      var sseUrl = buildStreamUrl(payloadSSE);
      var gotAny = false;
      var watchdog = setTimeout(function(){
        if (gotAny) return;
        sselog('WATCHDOG → POST fallback', real);
        sseFallbackFetch(payloadSSE, [real]).finally(markDone);
      }, SSE_WATCHDOG_MS);
      function markEvent(){ gotAny = true; if (watchdog){ clearTimeout(watchdog); watchdog = null; } }

      var rec = state.modelElements[frontId];
      if (rec && rec.element) addLoadingIndicator(rec.element, nameOf(frontId));

      var es = openSSE(sseUrl, {
        start: function(e){ markEvent(); var d = safeJson(e && e.data); if (d && d.chat_id) state.chatId = d.chat_id; },
        model_init: function(e){ markEvent(); var d = safeJson(e && e.data) || {}; d.panel = d.panel || real; state._boundPanels[d.panel]=frontId; state._boundPanels[real]=frontId; handleModelInit(d); },
        delta: function(e){ markEvent(); var d = safeJson(e && e.data) || {}; d.panel = d.panel || real; state._boundPanels[d.panel]=frontId; applyDeltaRecordFromPayload(d); },
        answer: function(e){ markEvent(); var d = safeJson(e && e.data) || {}; d.panel = d.panel || real; state._boundPanels[d.panel]=frontId; applyAnswerRecordFromPayload(d); },
        message: function(e){ markEvent(); var g = parseGenericMessage((e && e.data) || ''); var payload = g.raw || { text:g.text, model:frontId, panel:frontId }; payload.panel = payload.panel || frontId; state._boundPanels[payload.panel]=frontId; if (g.type==='answer'||g.type==='final') applyAnswerRecordFromPayload(payload); else applyDeltaRecordFromPayload(payload); },
        model_done: function(e){ markEvent(); var d = safeJson(e && e.data) || {}; d.panel = d.panel || real; var key = resolveTargetKey(d); var rec = state.modelElements[key]; if (rec){ rec.completed=true; removeLoadingIndicator(rec.element); var card=rec.element.closest('.bubble-card'); if(card){ var t=card.querySelector('.typing'); if(t) t.remove(); } } },
        done: function(){ markEvent(); try{ es.close && es.close(); }catch(_){} if (state.currentEventSource === es) state.currentEventSource = null; markDone(); },
        error: function(){ if (!gotAny) { sseFallbackFetch(payloadSSE, [real]).finally(markDone); } else { finishWithErrors(); markDone(); } }
      });
      state.currentEventSource = es;
      tasks.push(Promise.resolve());
    });

    // JSON – po vieną POST kiekvienam
    if (jsonFront.length) tasks.push(postOnceForModels(basePayload, jsonFront.map(getBackendModelId)).finally(markDone));

    return Promise.all(tasks).then(function(){ return { ok: true }; });
  }

  function sseFallbackFetch(payload, backendModels) {
    var base = normalizeSSEEndpoint(SSE_ENDPOINT || (API_BASE + '/stream'));
    var url = base + (base.indexOf('?')===-1 ? '?mode=once' : '&mode=once');

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (res) {
        if (!res.ok) return res.text().then(function (txt) {
          showErrorNotification('Nepavyko gauti atsakymo (' + res.status + ')', txt || '');
          throw new Error('HTTP ' + res.status + ' ' + res.statusText);
        });
        return res.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.answers)) throw new Error('Blogas fallback formato atsakymas');
        data.answers.forEach(function (item, idx) {
          var real = item.model || backendModels[idx] || backendModels[0] || 'auto';
          var frontId = (state._boundPanels && state._boundPanels[real]) || real;
          var front = Object.keys(FRONT_TO_BACK).find(function(k){ return FRONT_TO_BACK[k]===real; }) || real;
          applyAnswerRecordFromPayload({ model: front, panel: frontId, text: item.text });
        });
      })
      .catch(function (e) {
        console.error('[PAULE] Fallback fetch failed:', e);
        showErrorNotification('Nepavyko gauti atsakymo', e.message || String(e));
      });
  }

  function postOnceForModels(basePayload, backendModels) {
    return Promise.all(backendModels.map(function(realModel){
      return postOnceForSingleModel(basePayload, realModel);
    }));
  }
  function postOnceForSingleModel(basePayload, realModel){
    var body = Object.assign({}, basePayload, { model: realModel, models: realModel, mode: 'once' });
    var base = normalizeSSEEndpoint(SSE_ENDPOINT || (API_BASE + '/stream'));
    var url = base + (base.indexOf('?') === -1 ? '?mode=once' : '&mode=once');

    state._boundPanels = state._boundPanels || {};
    state._boundPanels[realModel] = state._boundPanels[realModel] || realModel;

    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
      .then(function(res){
        if (!res.ok) return res.text().then(function (txt) {
          showErrorNotification('JSON atsakymas nepavyko (' + realModel + ', ' + res.status + ')', txt || '');
          throw new Error('HTTP ' + res.status + ' ' + res.statusText);
        });
        return res.json();
      })
      .then(function(data){
        var frontId = (state._boundPanels && state._boundPanels[realModel]) || realModel;
        var front = Object.keys(FRONT_TO_BACK).find(function(k){ return FRONT_TO_BACK[k]===realModel; }) || realModel;

        if (Array.isArray(data.answers)) {
          data.answers.forEach(function (item) {
            var mdlBack = item.model || realModel;
            var mdlFront= Object.keys(FRONT_TO_BACK).find(function(k){ return FRONT_TO_BACK[k]===mdlBack; }) || front;
            var fr      = (state._boundPanels && state._boundPanels[mdlBack]) || frontId;
            applyAnswerRecordFromPayload({ model: mdlFront, panel: fr, text: item.text });
          });
        } else {
          var txt = data.text || data.answer || '';
          applyAnswerRecordFromPayload({ model: front, panel: frontId, text: txt });
        }
      })
      .catch(function(e){
        console.error('[PAULE] postOnceForSingleModel fail:', realModel, e);
        showErrorNotification('Nepavyko gauti JSON atsakymo ('+ realModel +')', e.message || String(e));
      });
  }

  function parseGenericMessage(str){
    var o = safeJson(str);
    if (!o) return { type:'delta', text:str, key:'', model:null, raw:null };
    var type = o.event || o.type || (o.done ? 'done' : (o.answer ? 'answer' : (o.delta ? 'delta' : 'delta')));
    var text = o.text || o.delta || o.answer || o.content || '';
    var key  = o.panel || o.key || o.model || '';
    var model= o.model || null;
    return { type:type, text:text, key:key, model:model, raw:o };
  }

  /* =========================================================
     13) /models įkėlimas (neprivaloma)
     ========================================================= */
  function loadAvailableModels() {
    if (!window.CONFIG || !window.CONFIG.restModels) return;
    fetch(window.CONFIG.restModels, { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status + ': ' + res.statusText);
        return res.json();
      })
      .then(function (data) {
        if (data.ok && Array.isArray(data.available)) {
          state.availableModels = [{ id: 'auto', alias: 'Auto' }].concat(data.available);
          updateModelPills();
        } else {
          throw new Error('Invalid response format');
        }
      })
      .catch(function (err) {
        console.warn('[PAULE] Models load failed:', err);
        state.availableModels = [];
        updateModelPills(true);
      });
  }
  function updateModelPills(forceEnableAll) {
    if (!elements.modelList) return;
    var ids = (!forceEnableAll && state.availableModels.length)
      ? new Set(state.availableModels.map(function (m) { return m.id; }))
      : null;
    var pills = elements.modelList.querySelectorAll('.model-pill[data-model]');
    for (var i = 0; i < pills.length; i++) {
      var id = pills[i].getAttribute('data-model') || '';
      var enabled = (id === 'auto') || (ids ? ids.has(id) : true);
      pills[i].style.opacity = enabled ? '1' : '0.55';
      pills[i].style.pointerEvents = enabled ? 'auto' : 'none';
      pills[i].title = enabled ? '' : 'Modelis neprieinamas';
    }
  }

  /* =========================================================
     14) „Ginčas/Teisėjas/Kompromisas“ (demo)
     ========================================================= */
  function addDebateActions() {
    var old = document.querySelector('.debate-actions');
    if (old && old.parentNode) old.remove();
    var box = document.createElement('div');
    box.className = 'debate-actions';
    box.innerHTML =
      '<button class="action-btn" onclick="window.PauleMain.startDebate()">Pradėti ginčą</button>' +
      '<button class="action-btn secondary" onclick="window.PauleMain.getJudgment()">Gauti teisėjo nuomonę</button>' +
      '<button class="action-btn secondary" onclick="window.PauleMain.findCompromise()">Rasti kompromisą</button>';
    if (elements.chatArea) elements.chatArea.appendChild(box);
    scrollToBottom();
  }
  function startDebate() {
    var debateModels = getModelsForDebate();
    if (debateModels.length < 2) {
      addSystemMessage('Ginčui reikia bent 2 modelių. Pasirinkite modelius viršuje.');
      setTimeout(addDebateActions, 1200);
      return;
    }
    addSystemMessage('Pradedamas AI ginčas: ' + debateModels.map(nameOf).join(', '));
    var prompt =
      'GINČO POZICIJA: "' + state.lastUserText + '"\n\n' +
      'Tavo užduotis ginče:\n' +
      '1. Pateik aiškią ir argumentuotą poziciją\n' +
      '2. Kritikuok kitų argumentų silpnybes\n' +
      '3. Duok konkrečius pavyzdžius ir duomenis\n' +
      '4. Būk įtikinamas ir išsamus\n' +
      '5. Ginčykis drąsiai';
    state.modelElements = {};
    streamRealAPI(prompt, debateModels).then(function () { setTimeout(addPostDebateActions, 1500); });
  }
  function getJudgment() {
    addSystemMessage('AI teisėjas analizuoja visas pozicijas...');
    var judgingPrompt =
      'Tu esi objektyvus AI teisėjas. Analizuok atsakymus į: "' + state.lastUserText + '"\n\n' +
      Object.keys(state.lastRound).map(function (back) {
        return '=== ' + nameOf(back) + ' ===\n' + (state.lastRound[back] || '') + '\n';
      }).join('\n') +
      '\nDuok objektyvų vertinimą:\n' +
      '1) Balai ir paaiškinimai\n2) Nugalėtojas\n3) Santrauka';
    state.modelElements = {};
    streamRealAPI(judgingPrompt, ['auto']);
  }
  function findCompromise() {
    addSystemMessage('AI modeliai ieško kompromiso...');
    var combined = Object.keys(state.lastRound).map(function (back) {
      return '=== ' + nameOf(back) + ' ===\n' + (state.lastRound[back] || '');
    }).join('\n\n');
    var compromisePrompt =
      'KOMPROMISO PAIEŠKA\n\n' + combined + '\n\n' +
      'Sujunk stiprybes į vieną planą, pateik veiksmų sąrašą.';
    state.modelElements = {};
    streamRealAPI(compromisePrompt, ['claude']);
  }
  function addPostDebateActions() {
    var box = document.createElement('div');
    box.className = 'debate-actions';
    box.innerHTML =
      '<button class="action-btn" onclick="window.PauleMain.getJudgment()">Teisėjas</button>' +
      '<button class="action-btn secondary" onclick="window.PauleMain.findCompromise()">Kompromisas</button>' +
      '<button class="action-btn secondary" onclick="window.PauleMain.continueDebate()">Tęsti ginčą</button>';
    if (elements.chatArea) elements.chatArea.appendChild(box);
    scrollToBottom();
  }
  function continueDebate() { removeDebateActions(); addSystemMessage('Įrašykite naują klausimą, kad tęstumėte.'); }
  function removeDebateActions(){ var el=document.querySelector('.debate-actions'); if (el&&el.parentNode) el.parentNode.removeChild(el); }
  function getModelsForDebate() {
    var participated = Object.keys(state.lastRound);
    if (participated.length >= 2) return participated;
    if (state.selectedModels.indexOf('auto') !== -1 || state.selectedModels.length === 0) {
      return ['chatgpt', 'claude', 'grok'];
    }
    return state.selectedModels.slice();
  }

  /* =========================================================
     15) PAGALBINIAI (UI)
     ========================================================= */
  function addLoadingIndicator(contentEl, modelName) {
    if (!contentEl) return;
    contentEl.innerHTML =
      '<div class="thinking"><div class="loading-dots"><span></span><span></span><span></span></div>' +
      '<span style="margin-left: 12px; color: var(--text-muted);">' + modelName + ' analizuoja...</span></div>';
  }
  function removeLoadingIndicator(contentEl) {
    if (!contentEl) return;
    var el = contentEl.querySelector('.thinking');
    if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s ease';
      setTimeout(function(){ if (el && el.parentNode) el.parentNode.removeChild(el); }, 280);
    }
  }
  function setInitialModelSelection() {
    if (!elements.modelList) return;
    var pills = elements.modelList.querySelectorAll('.model-pill');
    for (var i = 0; i < pills.length; i++) pills[i].classList.remove('active');
    var autoPill = elements.modelList.querySelector('[data-model="auto"]');
    if (autoPill) autoPill.classList.add('active');
  }
  function initializeWelcomeActions() {
    var arr = document.querySelectorAll('.welcome-btn');
    for (var i = 0; i < arr.length; i++) {
      arr[i].addEventListener('click', function (e) {
        // vieta presetams, jei norėsi
      });
    }
  }

  function initializeUserAuth() {
    try {
      var saved = localStorage.getItem('paule_user');
      if (saved) { state.user = JSON.parse(saved); updateUserInterface(); }
    } catch (_) {}
  }
  function updateUserInterface() {
    if (state.user) {
      if (elements.btnLogin)      elements.btnLogin.classList.add('hidden');
      if (elements.userProfile)   elements.userProfile.classList.remove('hidden');
    } else {
      if (elements.btnLogin)      elements.btnLogin.classList.remove('hidden');
      if (elements.userProfile)   elements.userProfile.classList.add('hidden');
    }
  }
  function handleLogout() {
    state.user = null;
    try { localStorage.removeItem('paule_user'); } catch (_) {}
    updateUserInterface();
    addSystemMessage('Sėkmingai atsijungėte!');
  }

  // Projektai / istorija (demo)
  function loadProjects() {
    state.projects = [
      { id: 'research', name: 'AI Tyrimai #1', type: 'research', updated: '2025-01-15' },
      { id: 'code', name: 'Kodo analizė #2', type: 'code', updated: '2025-01-14' },
      { id: 'business', name: 'Verslo strategija #3', type: 'business', updated: '2025-01-13' }
    ];
    updateProjectsList();
  }
  function updateProjectsList() {
    var list = document.getElementById('projectsList'); if (!list) return;
    var newItem = list.querySelector('[data-project="new"]');
    list.innerHTML = ''; if (newItem) list.appendChild(newItem);
    (state.projects || []).forEach(function (p) {
      var el = document.createElement('div');
      el.className = 'project-item';
      el.setAttribute('data-project', p.id);
      el.innerHTML = '<img src="' + ICONS_BASE + '/project.svg" alt="" style="width:14px;height:14px">' + p.name;
      el.addEventListener('click', function () { loadProject(p.id); });
      list.appendChild(el);
    });
  }
  function loadProject(id) {
    addSystemMessage('Įkeliamas projektas: ' + id);
    state.currentProject = id;
    var all = document.querySelectorAll('[data-project]');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    var cur = document.querySelector('[data-project="' + id + '"]');
    if (cur) cur.classList.add('active');
  }

  function seedChatHistory() {
    state.chatHistory = [
      { id: 'recent1', title: 'Sveikatos konsultacija', specialist: 'doctor',   date: '2025-01-15', preview: 'Klausimai apie karščiavimą...' },
      { id: 'recent2', title: 'Verslo strategija',       specialist: 'business', date: '2025-01-14', preview: 'Startup plėtros planai...' },
      { id: 'recent3', title: 'Receptų paieška',         specialist: 'chef',     date: '2025-01-13', preview: 'Sveikų patiekalų receptai...' },
      { id: 'recent4', title: 'Teisinė konsultacija',    specialist: 'lawyer',   date: '2025-01-12', preview: 'Sutarčių peržiūra...' },
      { id: 'recent5', title: 'Marketing strategija',    specialist: 'marketer', date: '2025-01-11', preview: 'Social media planas...' }
    ];
    updateHistoryList();
  }
  function updateHistoryList() {
    var list = document.getElementById('historyList'); if (!list) return;
    list.innerHTML = '';
    (state.chatHistory || []).forEach(function (h) {
      var el = document.createElement('div');
      el.className = 'project-item';
      el.setAttribute('data-history', h.id);
      el.innerHTML = '<img src="' + ICONS_BASE + '/nav-chat.svg" alt="" style="width:14px;height:14px">' + h.title;
      el.addEventListener('click', function () { /* galima būtų įkelti */ });
      list.appendChild(el);
    });
  }

  /* =========================================================
     16) STATISTIKA (demo)
     ========================================================= */
  function showModelStats(key) {
    var s = state.stats[key];
    if (!s) return;
    var winRate = Math.round((s.wins / s.total) * 100);
    addSystemMessage('📊 ' + key.toUpperCase() + ': ' + winRate + '% pergalių iš ' + s.total + ' ginčų (' + s.wins + ' pergalės)');
  }
  function updateStatsDisplay() {
    // paliekam kaip „no-op“, kol neturime konkretaus targeto
  }

  /* =========================================================
     17) UTIL
     ========================================================= */
  function showErrorNotification(message, details){
    var n = document.createElement('div');
    n.className = 'error-notification';
    n.innerHTML =
      '<div style="font-weight:600;margin-bottom:4px;">' + message + '</div>' +
      (details ? '<div style="font-size:12px;opacity:.8;">' + escapeHtml(details) + '</div>' : '') +
      '<button onclick="this.parentElement.remove()" style="position:absolute;top:8px;right:8px;background:none;border:none;color:#991b1b;cursor:pointer;font-size:16px;">×</button>';
    n.style.position = 'relative';
    n.style.paddingRight = '30px';
    document.body.appendChild(n);
    setTimeout(function(){ if(n && n.parentElement) n.remove(); }, 8000);
  }

  state.stickToBottom = true;
  function isNearBottom(){
    if (!elements || !elements.chatArea) return true;
    var el = elements.chatArea;
    return (el.scrollTop + el.clientHeight) >= (el.scrollHeight - 100);
  }
  function onChatScroll(){
    if (!elements || !elements.chatArea) return;
    state.stickToBottom = isNearBottom();
  }
  function attachChatScrollListener(){
    try{
      if (elements && elements.chatArea && !elements.chatArea._scrollHooked){
        elements.chatArea.addEventListener('scroll', onChatScroll);
        elements.chatArea._scrollHooked = true;
      }
    }catch(_){}
  }
  attachChatScrollListener();
  (function retryHook(i){ if (i<=0) return; setTimeout(function(){ attachChatScrollListener(); retryHook(i-1); }, 500); })(8);

  function scrollToBottom(){ if (!elements || !elements.chatArea) return; elements.chatArea.scrollTop = elements.chatArea.scrollHeight; }
  function scrollToBottomIfNeeded(){ if (!elements || !elements.chatArea) return; if (state.stickToBottom) elements.chatArea.scrollTop = elements.chatArea.scrollHeight; }

  function getCurrentTime(){ return new Date().toLocaleTimeString('lt-LT', { hour:'2-digit', minute:'2-digit' }); }
  function escapeHtml(text){ var div = document.createElement('div'); div.textContent = (text == null ? '' : text); return div.innerHTML; }
  function safeJson(s){ try{ return JSON.parse(s); }catch(_){ return null; } }

  function fadeInAppend(el) {
    if (!elements.chatArea) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    elements.chatArea.appendChild(el);
    requestAnimationFrame(function () {
      el.style.transition = 'all 0.3s ease';
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    });
  }

  function updateBottomSectionPosition() {
    if (!elements.bottomSection) return;
    if (state.hasMessagesStarted) {
      elements.bottomSection.classList.remove('initial-position');
      elements.bottomSection.classList.add('after-message');
    } else {
      elements.bottomSection.classList.remove('after-message');
      elements.bottomSection.classList.add('initial-position');
    }
  }

  /* =========================================================
     18) TEST REŽIMAS (?paule-test=1)
     ========================================================= */
  function isTestMode() { return new URLSearchParams(location.search).has('paule-test'); }
  function runSelfTestUI() {
    var badge = document.createElement('div');
    badge.className = 'error-notification';
    badge.style.background = '#ecfeff';
    badge.style.borderColor = '#a5f3fc';
    badge.style.color = '#0e7490';
    badge.innerHTML = 'PAULE JS veikia 🎉 <small style="opacity:.7;display:block">Pašalink „?paule-test=1“, jei nebenori šio pranešimo</small>';
    document.body.appendChild(badge);
    setTimeout(function () { if (badge && badge.parentNode) badge.remove(); }, 5000);
  }

  /* =========================================================
     19) GLOBALUS EKSPORTAS
     ========================================================= */
  window.PauleMain = {
    initialize: initialize,
    startDebate: startDebate,
    getJudgment: getJudgment,
    findCompromise: findCompromise,
    continueDebate: continueDebate,
    state: state,
    elements: elements,
    openCreativePopup: openCreativePopup,
    __selfTest: function () { return 'ok'; }
  };

  /* =========================================================
     20) START
     ========================================================= */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  console.log('[PAULE] ========================================');
  console.log('[PAULE] 🚀 UI/Transport klientas pakrautas');
  console.log('[PAULE] ✅ SSE + POST fallback, multi-model');
  console.log('[PAULE] ✅ Be WP, be nonce; API iš window.PAULE_CONFIG');
  console.log('[PAULE] ========================================');

  /* =========================================================
     21) PAPRASTAS KLIENTAS (neprivalomas) – tik jei nori kviesti tiesiai
     ========================================================= */
  (function SimpleClient(){
    const AUTO_INIT = !window.PauleMain; // jei yra didysis – šito nenaudojam
    if (!AUTO_INIT) return;

    const ENDPOINT = (window.PAULE_CONFIG?.routes?.stream) || (API_BASE + '/stream');

    const $ = (sel, root=document) => root.querySelector(sel);
    const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
    const chatArea   = $('#chatArea');
    const msgInput   = $('#messageInput');
    const sendBtn    = $('#sendBtn');
    const newChatBtn = $('#btnNewChat');
    const modelPills = $$('.model-pill');

    let es = null;
    const panels = new Map();
    let currentChatId = null;

    if (!window.CSS) window.CSS = {};
    if (typeof window.CSS.escape !== 'function') {
      window.CSS.escape = s => String(s).replace(/[^a-zA-Z0-9_\-]/g, m => '\\' + m);
    }

    function escapeHtml(x){ return String(x).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]); }

    function ensurePanel(payload) {
      const key = payload.panel || (payload.chat_id && payload.model ? (payload.chat_id + '::' + payload.model) : 'p');
      if (panels.has(key)) return panels.get(key);
      const node = document.createElement('div');
      node.className = 'panel';
      node.id = `panel-${CSS.escape(key)}`;
      node.dataset.panel = key;
      node.innerHTML =
        `<div class="head"><div class="title">${escapeHtml(payload.alias || payload.model || 'Model')}</div><div class="status">…</div></div>
         <div class="body" style="white-space:pre-wrap;"></div>`;
      chatArea?.appendChild(node);
      panels.set(key, node);
      return node;
    }
    function setStatus(node, s){ const t = node?.querySelector('.status'); if (t) t.textContent = s; }
    function appendText(node, txt){ const body=node?.querySelector('.body'); if(!body) return; body.textContent += (txt || ''); chatArea?.scrollTo({ top: chatArea.scrollHeight, behavior:'smooth' }); }
    function clearChatUI(){ panels.clear(); if (chatArea) chatArea.innerHTML = ''; }

    function getSelectedModelsCSV(){
      const active = $$('.model-pill.active');
      if (!active.length) return 'auto';
      return active.map(x => x.getAttribute('data-model') || '').filter(Boolean).join(',');
    }

    function bindModelPills(){
      modelPills.forEach(pill => {
        pill.addEventListener('click', () => {
          if (pill.getAttribute('data-model') === 'auto') {
            $$('.model-pill').forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
          } else {
            $('.model-pill[data-model="auto"]')?.classList.remove('active');
            pill.classList.toggle('active');
            if ($$('.model-pill.active').length === 0) $('.model-pill[data-model="auto"]')?.classList.add('active');
          }
        });
      });
    }

    function newChat(){ currentChatId=null; clearChatUI(); if (msgInput){ msgInput.value=''; msgInput.focus(); } }

    function openSSE(message, modelsCSV, chatId){
      if (!message) return;
      if (es) { try{ es.close(); }catch(_){ } es=null; }
      clearChatUI();

      const url = new URL(ENDPOINT, location.origin);
      url.searchParams.set('message', message);
      if (modelsCSV) url.searchParams.set('models', modelsCSV);
      if (chatId)    url.searchParams.set('chat_id', chatId);

      if (!('EventSource' in window)) return postOnceJSON(message, modelsCSV, chatId);

      es = new EventSource(url.toString());
      es.addEventListener('start', (e) => { const d = safeJson(e.data); if (d?.chat_id) currentChatId = d.chat_id; });
      es.addEventListener('model_init', (e) => { const p=safeJson(e.data); if(!p) return; const n=ensurePanel(p); setStatus(n,'…'); });
      es.addEventListener('delta', (e) => { const p=safeJson(e.data); if(!p) return; const n=ensurePanel(p); appendText(n, p.text || ''); });
      es.addEventListener('answer', (e) => { const p=safeJson(e.data); if(!p) return; const n=ensurePanel(p); const body=n.querySelector('.body'); if(p.text && body && !body.textContent) appendText(n,p.text); });
      es.addEventListener('model_done', (e) => { const p=safeJson(e.data); if(!p) return; const n=ensurePanel(p); setStatus(n,'✓'); });
      es.addEventListener('done', () => { try{ es.close(); }catch(_){ } es=null; });
      es.onerror = () => { /* no auto-reconnect */ };
    }

    async function postOnceJSON(message, modelsCSV, chatId){
      const body = { mode:'once', message, models: modelsCSV, chat_id: chatId };
      let data = null;
      try {
        const res = await fetch(ENDPOINT.replace('/stream','/stream') + (ENDPOINT.includes('?')?'&':'?') + 'mode=once', {
          method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
        });
        data = await res.json();
      } catch (err) { console.error('postOnceJSON error:', err); return; }

      currentChatId = data?.chat_id || currentChatId;
      clearChatUI();
      for (const a of (data?.answers || [])) {
        const node = ensurePanel(a);
        if (node) { node.querySelector('.title').textContent = a.alias || a.model || 'Model'; appendText(node, a.text || ''); setStatus(node, a.ok ? '✓' : '⚠︎'); }
      }
      if (data?.judge?.final_answer) {
        const j = { panel: (currentChatId || 'chat') + '::AI_JUDGE', alias: (data.judge.label || 'AI Judge'), model: 'AI_JUDGE', chat_id: currentChatId || 'chat' };
        const node = ensurePanel(j); appendText(node, data.judge.final_answer); setStatus(node, '✓');
      }
    }

    function bindInput(){
      msgInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendCurrent(); } });
      sendBtn?.addEventListener('click', sendCurrent);
      newChatBtn?.addEventListener('click', newChat);
    }
    function sendCurrent(){
      const message = (msgInput?.value || '').trim(); if (!message) return;
      const modelsCSV = getSelectedModelsCSV();
      openSSE(message, modelsCSV, currentChatId || undefined);
      if (msgInput) msgInput.value = '';
    }

    document.addEventListener('DOMContentLoaded', () => { bindModelPills(); bindInput(); });
    window.PAULE_UI = { openSSE, postOnceJSON, newChat, __client:'simple', __autoInit:true };
  })();

})();
