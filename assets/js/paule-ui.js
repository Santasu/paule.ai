(function () {
  'use strict';

  /* U shim – įdėk čia, iškart po 'use strict'; */
  (function(){ 
    try { 
      window.U = window.U || {}; 
      if (!Array.isArray(window.U.stack)) window.U.stack = []; 
    } catch(_){}
  })();

  // =========================
  // 0) BAZINIAI KELIAI (dinamiškai iš aplinkos/WP) + VERCEL STATIC MODE
  // =========================

  function _rtrim(s){ return String(s||'').replace(/\/+$/,''); }
  function _isStreamUrl(u){ return /\/stream(?:\?|$)/.test(String(u||'')); }

  var ORIGIN =
    (window.location && window.location.origin)
      ? _rtrim(window.location.origin)
      : 'https://augam.ai';

  // Pradinis default (bus perrašyta žemiau pagal režimą)
  var PLUGIN_BASE   = _rtrim(ORIGIN + '/wp-content/plugins/augam-ai');
  var API_BASE      = _rtrim(ORIGIN + '/wp-json/augam/v1');
  var FEATURES_BASE = _rtrim(PLUGIN_BASE + '/assets/features');
  var ICONS_BASE    = _rtrim(PLUGIN_BASE + '/assets/icon');

  // Pagrindinis SSE kelias (pagal nutylėjimą iš API_BASE)
  var SSE_ENDPOINT  = _rtrim(API_BASE) + '/stream';

  // 👉 STATIC režimas (Vercel / paule.ai) — jokių WP kelių, asset’ai iš /assets
  var IS_VERCEL_HOST = /(?:\.vercel\.app$|^paule\.ai$)/i.test(location.hostname);
  var STATIC_MODE    = !!window.__STATIC_MODE__ || IS_VERCEL_HOST;

  if (STATIC_MODE) {
    // Assetai
    PLUGIN_BASE   = '/assets';
    ICONS_BASE    = '/assets/icon';
    // Funkcinių modulių HTML bandysim iš kelių vietų (žr. loadFeatureModule)
    FEATURES_BASE = '/assets/features';

    // Jeigu konfigūroje NĖRA API, paliekam tuščia → UI veiks be tinklo
    if (!(window.AUGAM_CONFIG && (
          window.AUGAM_CONFIG.restBase ||
          window.AUGAM_CONFIG.restStream ||
          window.AUGAM_CONFIG.restStreamSSE))) {
      API_BASE     = '';
      SSE_ENDPOINT = '';
    }
  }

  /* Jei WP įskiepis perdavė tikslius kelius – gerbiam juos */
  if (window.AUGAM_CONFIG) {
    if (window.AUGAM_CONFIG.pluginBase)   PLUGIN_BASE   = _rtrim(window.AUGAM_CONFIG.pluginBase);
    if (window.AUGAM_CONFIG.featuresBase) FEATURES_BASE = _rtrim(window.AUGAM_CONFIG.featuresBase);
    if (window.AUGAM_CONFIG.iconsBase)    ICONS_BASE    = _rtrim(window.AUGAM_CONFIG.iconsBase);

    // 1) Jeigu perdavė REST bazę (pvz., https://site/wp-json/augam/v1)
    if (window.AUGAM_CONFIG.restBase) {
      API_BASE = _rtrim(window.AUGAM_CONFIG.restBase);
      SSE_ENDPOINT = API_BASE + '/stream';
    }

    // 2) Jeigu perdavė tiesioginį SSE kelią (pilną) – pirmenybė
    if (window.AUGAM_CONFIG.restStreamSSE) {
      SSE_ENDPOINT = _rtrim(window.AUGAM_CONFIG.restStreamSSE);
      // Išvesti API_BASE iš SSE (nuimant /stream pabaigą), jei dar neperrašyta
      if (_isStreamUrl(SSE_ENDPOINT)) API_BASE = _rtrim(SSE_ENDPOINT.replace(/\/stream(?:\?.*)?$/,''));
    }
    // 3) Jeigu perdavė „restStream“ – tai gali būti pilnas /stream URL arba tik bazė
    else if (window.AUGAM_CONFIG.restStream) {
      var rs = _rtrim(window.AUGAM_CONFIG.restStream);
      if (_isStreamUrl(rs)) {
        SSE_ENDPOINT = rs;
        API_BASE = _rtrim(rs.replace(/\/stream(?:\?.*)?$/,''));
      } else {
        API_BASE = rs;
        SSE_ENDPOINT = API_BASE + '/stream';
      }
    }
  }

  // WP nonce paėmimas (naudojamas kai kur GET/POST kvietimuose)
  function getWpNonce() {
    var cand =
      (window.wpApiSettings && window.wpApiSettings.nonce) ||
      (window.AUGAM_CONFIG && window.AUGAM_CONFIG.nonce) ||
      '';
    if (!cand) { try { console.warn('[AUGAM] WP nonce nerastas. /models gali grąžinti 403.'); } catch (_) {} }
    return cand;
  }


  // =========================
  /* 1) KONFIGŪRACIJA */
  // =========================
  var DEBUG = false;

  var BACKEND_MODEL_IDS = {
    'gpt-4o-mini': 'gpt-4o-mini',
    'claude-4-sonnet': 'claude-4-sonnet',
    'gemini-2.5-flash': 'gemini-2.5-flash',
    'grok-4': 'grok-4',
    'deepseek-chat': 'deepseek-chat',
    'meta-llama/Llama-4-Scout-17B-16E-Instruct': 'meta-llama/Llama-4-Scout-17B-16E-Instruct',
    'augam-auto': 'auto'
  };
  function getBackendModelId(frontendId) { return BACKEND_MODEL_IDS[frontendId] || frontendId; }

  // ⚙️ Sujungiame CONFIG iš esamo window.CONFIG, AUGAM_CONFIG ar defaultų
  window.CONFIG = (function () {
    var base = window.CONFIG || window.AUGAM_CONFIG || {};
    var cfg = {
      restModels:       base.restModels       || (API_BASE ? (API_BASE + '/models') : ''),
      restStream:       base.restStream       || (API_BASE ? (API_BASE + '/stream') : ''),
      restStreamSSE:    base.restStreamSSE    || (API_BASE ? (API_BASE + '/stream-sse') : ''),
      restDiagnostics:  base.restDiagnostics  || (API_BASE ? (API_BASE + '/diagnostics') : ''),
      restComicCreate:  base.restComicCreate  || (API_BASE ? (API_BASE + '/flux/create') : ''),
      restMusicCreate:  base.restMusicCreate  || (API_BASE ? (API_BASE + '/music/create') : ''),
      restMusicStatus:  base.restMusicStatus  || (API_BASE ? (API_BASE + '/music/status') : ''),
      restRunwayImage:  base.restRunwayImage  || (API_BASE ? (API_BASE + '/runway/image') : ''),
      restRunwayStatus: base.restRunwayStatus || (API_BASE ? (API_BASE + '/runway/status') : ''),
      nonce:            base.nonce            || getWpNonce(),
      version:          base.version          || '2.20.0',
      theme:            base.theme            || 'auto',
      // 1 = naudoti SSE endpointą (/stream-sse), 0 = naudoti POST/long-poll (/stream)
      sseDefault:       (typeof base.sseDefault !== 'undefined') ? base.sseDefault : 1
    };

    // normalizuojame kelius (nuimame perteklinius / gale)
    cfg.restModels       = _rtrim(cfg.restModels || '');
    cfg.restStream       = _rtrim(cfg.restStream || '');
    cfg.restStreamSSE    = _rtrim(cfg.restStreamSSE || '');
    cfg.restDiagnostics  = _rtrim(cfg.restDiagnostics || '');
    cfg.restComicCreate  = _rtrim(cfg.restComicCreate || '');
    cfg.restMusicCreate  = _rtrim(cfg.restMusicCreate || '');
    cfg.restMusicStatus  = _rtrim(cfg.restMusicStatus || '');
    cfg.restRunwayImage  = _rtrim(cfg.restRunwayImage || '');
    cfg.restRunwayStatus = _rtrim(cfg.restRunwayStatus || '');

    // Saugiklis: jei CONFIG atkeliavo be restStreamSSE – susikuriame iš restStream (tik jei turim bazę)
    if (!cfg.restStreamSSE && cfg.restStream) {
      cfg.restStreamSSE = String(cfg.restStream).replace(/\/stream(?:\/)?$/, '/stream-sse');
    }

    return cfg;
  })();

  // ✅ Galutinis pasirinkimas: kurį srautą naudoti UI logikoje
  try {
    if (window.CONFIG.sseDefault) {
      // Naudosime SSE srautą (EventSource)
      SSE_ENDPOINT = window.CONFIG.restStreamSSE || (API_BASE ? (API_BASE + '/stream-sse') : '');
    } else {
      // Naudosime paprastą POST /stream (fallback režimas)
      SSE_ENDPOINT = window.CONFIG.restStream || (API_BASE ? (API_BASE + '/stream') : '');
    }
  } catch (_e) {
    // jei kas – paliekame anksčiau nustatytą SSE_ENDPOINT
  }

  // STATIC režime, kai nėra jokių REST/SSE kelių – paverčiam į „tylų“ UI režimą
  if (STATIC_MODE && !window.CONFIG.restStream && !window.CONFIG.restStreamSSE) {
    SSE_ENDPOINT = '';
  }

  if (DEBUG) {
    try {
      console.log('[AUGAM][CONFIG]', window.CONFIG);
      console.log('[AUGAM] Naudojamas srautas:', SSE_ENDPOINT || '(none – static mode)');
    } catch (_){}
  }



  // =========================
  /* 2) BŪSENA */
  // =========================
  var state = {
    theme: getInitialTheme(),
    selectedModels: ['augam-auto'],
    isStreaming: false,
    chatId: null,
    lastUserText: '',
    lastRound: {},
    stats: {
      gpt: { wins: 37, total: 42 },
      claude: { wins: 35, total: 38 },
      deepseek: { wins: 19, total: 25 },
      llama: { wins: 48, total: 51 },
      grok: { wins: 16, total: 19 },
      gemini: { wins: 30, total: 34 }
    },
    chatPhase: 'initial',
    modelElements: {},
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
    debateButtonsShown: false          // ✅ reikalinga Ginčo/Teisėjo/Kompromiso rodyme
  };
  // =========================


  // =========================
  // 3) DOM
  // =========================
  var elements = {
    modelList: document.getElementById('modelList'),
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
    specialistGrid: document.getElementById('specialistGrid'),
    mobileOverlay: document.getElementById('mobileOverlay'),
    bottomSection: document.getElementById('bottomSection'),
    loginModalOverlay: document.getElementById('loginModalOverlay'),
    closeLoginModal: document.getElementById('closeLoginModal'),
    googleLoginBtn: document.getElementById('googleLoginBtn'),
    loginSubmitBtn: document.getElementById('loginSubmitBtn'),
    projectsList: document.getElementById('projectsList'),
    historyList: document.getElementById('historyList')
  };

  
  //===== START: 4) INIT (su seedChatHistory kvietimu) =====/
  function initialize() {
    try {
      if (isTestMode()) runSelfTestUI();

      clearDemoSeeds();
      applyTheme();
      wireEvents();
      updateStatsDisplay();
      setInitialModelSelection();
      loadAvailableModels();

      // 🌐 STATIC režime – užpildom lokaliai, kad visi „pill“ būtų aktyvūs
      if (STATIC_MODE && (!state.availableModels || !state.availableModels.length)) {
        state.availableModels = [
          { id:'augam-auto' },
          { id:'gpt-4o-mini' },
          { id:'claude-4-sonnet' },
          { id:'gemini-2.5-flash' },
          { id:'grok-4' },
          { id:'deepseek-chat' },
          { id:'meta-llama/Llama-4-Scout-17B-16E-Instruct' }
        ];
        updateModelPills(true);
      }

      updateBottomSectionPosition();
      initializeWelcomeActions();
      initializeUserAuth();
      loadProjects();
      seedChatHistory();         
      loadAllFeatureModules();
      initializeCreativeModules();
    } catch (error) {
      console.error('[AUGAM] Initialization error:', error);
      showErrorNotification('Klaida inicializuojant aplikaciją: ' + error.message);
    }
  }

  function clearDemoSeeds() {
    try {
      if (elements.chatArea) {
        var demoMsgs = elements.chatArea.querySelectorAll('.message, .thinking');
        if (demoMsgs.length) elements.chatArea.innerHTML = '';
      }
    } catch (e) { console.warn('[AUGAM] clearDemoSeeds warn:', e); }
  }



  // =========================
  // 5) MODULIAI
  // =========================
  function loadAllFeatureModules() {
    ['specialist-overlay', 'music', 'photo', 'video', 'file'].forEach(loadFeatureModule);
  }

  // Fallback: bandome keliais keliais (assets/features → / → praleidžiam tyliai)
  function loadFeatureModule(moduleName) {
    var candidates = [];
    if (FEATURES_BASE) candidates.push(_rtrim(FEATURES_BASE) + '/' + moduleName + '.html');
    candidates.push('/assets/features/' + moduleName + '.html'); // dažniausias
    candidates.push('/' + moduleName + '.html');                 // repo šaknis

    (function tryNext(i){
      if (i >= candidates.length) return; // tyliai – modulis neprivalomas
      fetch(candidates[i], { cache: 'no-store' })
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res.text(); })
        .then(function (html) {
          var containerId = moduleName === 'specialist-overlay' ? 'specialistContainer' : 'creativeContainer';
          var container = document.getElementById(containerId) || document.body;
          container.insertAdjacentHTML('beforeend', html);
        })
        .catch(function () { tryNext(i+1); });
    })(0);
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

  // =========================
  // 6) TEMA
  // =========================
  function getInitialTheme() {
    try {
      var saved = localStorage.getItem('augam_theme');
      if (saved && saved !== 'auto') return saved;
      var hour = new Date().getHours();
      return (hour >= 20 || hour < 7) ? 'dark' : 'light';
    } catch (e) { return 'light'; }
  }
  function applyTheme() { (document.documentElement || document.body).setAttribute('data-theme', state.theme); }
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem('augam_theme', state.theme); } catch (_) {}
    applyTheme();
    document.body.style.transition = 'all 0.3s ease';
    setTimeout(function () { document.body.style.transition = ''; }, 300);
  }

  // =========================
  // 7) EVENT’AI
  // =========================
  function wireEvents() {
    // Auth
    if (elements.btnLogin) elements.btnLogin.addEventListener('click', openLoginModal);
    if (elements.closeLoginModal) elements.closeLoginModal.addEventListener('click', closeLoginModal);
    if (elements.googleLoginBtn) elements.googleLoginBtn.addEventListener('click', handleGoogleLogin);
    if (elements.loginSubmitBtn) elements.loginSubmitBtn.addEventListener('click', handleEmailLogin);

    // Profilio dropdown
    if (elements.userProfile) elements.userProfile.addEventListener('click', function (e) {
      e.stopPropagation();
      if (elements.profileDropdown) elements.profileDropdown.classList.toggle('active');
    });
    if (elements.profileDropdown) elements.profileDropdown.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action]');
      var action = btn && btn.getAttribute('data-action');
      if (!action) return;
      elements.profileDropdown.classList.remove('active');
      switch (action) {
        case 'logout': handleLogout(); break;
        case 'theme': toggleTheme(); break;
        case 'profile': addSystemMessage('Profilio nustatymai atidaromi...'); break;
        case 'settings': addSystemMessage('Nustatymai atidaromi...'); break;
      }
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
    if (elements.btnMobile) elements.btnMobile.addEventListener('click', function (e) {
      e.stopPropagation();
      if (elements.sidebar && elements.sidebar.classList.contains('open')) closeSidebar(); else openSidebar();
    });
    if (elements.mobileOverlay) elements.mobileOverlay.addEventListener('click', closeSidebar);

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

    // Įrankiai
    var tbar = document.querySelector('.tools-bar');
    if (tbar) tbar.addEventListener('click', handleToolClick);
    var mbar = document.querySelector('.mobile-bottom-bar');
    if (mbar) mbar.addEventListener('click', handleMobileToolClick);

    // Modal overlay
    if (elements.loginModalOverlay) elements.loginModalOverlay.addEventListener('click', function (e) {
      if (e.target === elements.loginModalOverlay) closeLoginModal();
    });

    // Window
    window.addEventListener('resize', updateBottomSectionPosition);

    // Shortcut’ai
    document.addEventListener('keydown', function (e) {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'k': e.preventDefault(); if (elements.messageInput) elements.messageInput.focus(); break;
          case 'n': e.preventDefault(); location.reload(); break;
          case 'd': e.preventDefault(); toggleTheme(); break;
          case 'l': e.preventDefault(); state.user ? handleLogout() : openLoginModal(); break;
        }
      }
      if (e.key === 'Escape') {
        closeLoginModal();
        if (elements.profileDropdown) elements.profileDropdown.classList.remove('active');
        var opened = document.querySelectorAll('.creative-popup.active');
        for (var i = 0; i < opened.length; i++) opened[i].classList.remove('active');
        if (window.AugamSpecialist && window.AugamSpecialist.close) window.AugamSpecialist.close();
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

  // =========================
  // 8) SPECIALISTAI
  // =========================
  function handleSpecialistClick(e) {
    var chip = e.target.closest('[data-spec]'); if (!chip) return;
    if (window.innerWidth <= 1024) closeSidebar();
    var chips = elements.specialistGrid ? elements.specialistGrid.querySelectorAll('.chip') : [];
    for (var i = 0; i < chips.length; i++) chips[i].classList.remove('active');
    chip.classList.add('active');

    var spec = chip.getAttribute('data-spec');
    if (window.AugamSpecialist && typeof window.AugamSpecialist.open === 'function') {
      window.AugamSpecialist.open(spec);
    } else {
      addSystemMessage('Specialisto langas atidaromas (modulis turi būti įkeltas).');
    }
  }

  // =========================
  // 9) MODELIAI
  // =========================
  function handleModelClick(e) {
    var pill = e.target.closest('.model-pill'); if (!pill) return;
    var modelId = pill.getAttribute('data-model');
    var autoPill = elements.modelList ? elements.modelList.querySelector('[data-model="augam-auto"]') : null;

    if (modelId === 'augam-auto') {
      var pills = elements.modelList ? elements.modelList.querySelectorAll('.model-pill') : [];
      for (var i = 0; i < pills.length; i++) pills[i].classList.remove('active');
      pill.classList.add('active');
      state.selectedModels = ['augam-auto'];
      updateModelSelectionDisplay();
      return;
    }

    if (autoPill) autoPill.classList.remove('active');
    pill.classList.toggle('active');

    var active = [];
    var act = elements.modelList ? elements.modelList.querySelectorAll('.model-pill.active') : [];
    for (var j = 0; j < act.length; j++) {
      var id = act[j].getAttribute('data-model');
      if (id && id !== 'augam-auto') active.push(id);
    }

    if (active.length === 0) {
      if (autoPill) autoPill.classList.add('active');
      state.selectedModels = ['augam-auto'];
    } else {
      state.selectedModels = active;
    }
    updateModelSelectionDisplay();
  }

  function updateModelSelectionDisplay() {
    var isAuto = state.selectedModels.length === 1 && state.selectedModels[0] === 'augam-auto';
    var txt = isAuto ? 'Auto (Llama 4 Scout)' : 'Pasirinkti: ' + state.selectedModels.join(', ');
    try { console.log('[AUGAM] ' + txt); } catch (_) {}
  }
  function getActiveModels() {
    if (state.selectedModels.indexOf('augam-auto') !== -1 || state.selectedModels.length === 0) return ['auto'];
    return state.selectedModels.slice();
  }

  // =========================
  // 10) ĮRANKIAI (popup’ai)
  // =========================
  function handleToolClick(e) {
    var tool = e.target.closest('.tool'); if (!tool) return;
    var toolType = tool.getAttribute('data-tool');

    var tools = document.querySelectorAll('.tool');
    for (var i = 0; i < tools.length; i++) tools[i].classList.remove('active');
    tool.classList.add('active');

    switch (toolType) {
      case 'song': openCreativePopup('musicPopup'); break;
      case 'photo': openCreativePopup('photoPopup'); break;
      case 'mindmap': openCreativePopup('videoPopup'); break;
      case 'file': openCreativePopup('filePopup'); break;
      case 'research': addSystemMessage('Tyrinėjimo funkcija paleidžiama...'); startResearchMode(); break;
      case 'think': addSystemMessage('Mąstymo režimas paleidžiamas...'); startThinkMode(); break;
      default: addSystemMessage(toolType + ' įrankis dar kuriamas');
    }
    if (window.innerWidth <= 1024) closeSidebar();
  }
  function handleMobileToolClick(e) {
    var tool = e.target.closest('.mobile-icon'); if (!tool) return;
    var toolType = tool.getAttribute('data-mobile-tool');

    var icons = document.querySelectorAll('.mobile-icon');
    for (var i = 0; i < icons.length; i++) icons[i].classList.remove('active');
    tool.classList.add('active');

    switch (toolType) {
      case 'song': openCreativePopup('musicPopup'); break;
      case 'photo': openCreativePopup('photoPopup'); break;
      case 'mindmap': openCreativePopup('videoPopup'); break;
      case 'file': openCreativePopup('filePopup'); break;
      default: addSystemMessage(toolType + ' įrankis dar kuriamas');
    }
    setTimeout(function () { tool.classList.remove('active'); }, 900);
  }
  function openCreativePopup(popupId) {
    var popup = document.getElementById(popupId);
    if (popup) popup.classList.add('active');
    else showErrorNotification('Modulis dar neįkeltas. Pabandykite dar kartą.');
  }
  function startResearchMode() {
    if (elements.messageInput) elements.messageInput.placeholder = "Ką norėtumėte ištirti? (pvz. 'Išanalizuok rinkos tendencijas')";
    addSystemMessage('Tyrinėjimo režimas aktyvuotas. Jūsų klausimas bus išanalizuotas iš kelių šaltinių.');
  }
  function startThinkMode() {
    if (elements.messageInput) elements.messageInput.placeholder = "Apie ką norėtumėte pagalvoti? (pvz. 'Sprendimo priėmimo strategijos')";
    addSystemMessage('Mąstymo režimas aktyvuotas. AI išanalizuos problemą iš įvairių perspektyvų.');
  }

  // ====== (A) SENOS LOGIKOS PANELIŲ PRIEŠ-SUKŪRIMAS (multimodel) ======
  function preallocateModelPanels(models) {
    state.modelElements = {};
    state._pendingModelQueue = [];   // eilė kortelių, į kurias lips pirmi nepažymėti paneliai
    state._boundPanels = {};         // serverio „panel“ -> mūsų kortelės raktas

    (models || []).forEach(function (modelId) {
      var el = addSpecialistMessage({
        model: modelId,
        streaming: true,
        label: getModelDisplayName(modelId)
      });
      state.modelElements[modelId] = {
        element: el,
        content: '',
        completed: false,
        key: modelId,
        model: modelId,
        _locked: false
      };
      state._pendingModelQueue.push(modelId);
    });
  }

  function takeNextUnboundModelKey() {
    for (var i = 0; i < state._pendingModelQueue.length; i++) {
      var k = state._pendingModelQueue[i];
      var rec = state.modelElements[k];
      if (rec && !rec._locked) { rec._locked = true; return k; }
    }
    // jei visi užimti – sukurti bendrą „auto“ panelį (suderinamumas su “auto”)
    var el = addSpecialistMessage({ model: 'auto', streaming: true, label: getModelDisplayName('auto') });
    var genKey = 'auto:' + Math.random().toString(36).slice(2, 7);
    state.modelElements[genKey] = { element: el, content: '', completed: false, key: genKey, model: 'auto', _locked: true };
    return genKey;
  }

  // „panel“/„model“ iš serverio → į mūsų vietinę kortelę
  function resolveTargetKey(payload) {
    var m = payload && (payload.panel || payload.model);

    // jei turim tikslų raktą — naudok jį
    if (m && state.modelElements[m]) return m;

    // jei serverio "panel" jau pririštas prie kortelės — naudok
    if (m && state._boundPanels[m]) return state._boundPanels[m];

    // priskirk kitai dar „neužimtai“ mūsų kortelei
    var k = takeNextUnboundModelKey();
    if (m) state._boundPanels[m] = k;
    return k;
  }

  // Saugus mygtukų rodymas (jei pas tave nėra ginčo modulio)
  if (typeof checkDebateButtons !== 'function') {
    function checkDebateButtons() { /* no-op */ }
  }
  function safeDebateButtons() {
    try { checkDebateButtons && checkDebateButtons(); } catch(_) {}
  }
  
  // === [PATCH A] TRANSPORT PASIRINKIMAS: kurie modeliai be SSE (POST only) ===
  var NON_SSE_MODELS = new Set([
    'claude-4-sonnet',
    'grok-4',
    'gemini-2.5-flash'
  ]);

  function splitModelsByTransport(models){
    var out = { stream: [], json: [] };
    (models || []).forEach(function(fid){
      if (!fid) return;
      // Auto – visada per SSE
      if (fid === 'augam-auto' || fid === 'auto') { out.stream.push(fid); return; }
      // Šitiems modeliams – be SSE (tik JSON)
      if (NON_SSE_MODELS.has(fid)) out.json.push(fid);
      else out.stream.push(fid);
    });
    return out;
  }


  // =========================
  // 11) PRANEŠIMAI (pataisyta)
  // =========================
  function sendMessage() {
    if (!elements.messageInput) return;
    var text = (elements.messageInput.value || '').trim();
    if (!text) return;

    if (state.isStreaming) stopStreaming();

    state.lastUserText = text;
    if (!state.hasMessagesStarted) { state.hasMessagesStarted = true; updateBottomSectionPosition(); }
    hideWelcome();

    if (elements.sendBtn) {
      elements.sendBtn.style.background = 'var(--success)';
      elements.sendBtn.style.transform = 'scale(0.95)';
      setTimeout(function () {
        if (!elements.sendBtn) return;
        elements.sendBtn.style.background = '';
        elements.sendBtn.style.transform = 'scale(1)';
      }, 180);
    }

    addUserMessage(text);
    elements.messageInput.value = '';
    autoResizeInput();
    if (window.innerWidth <= 1024) closeSidebar();

    var selectedModels = getActiveModels();

    // Jeigu dėl kokių nors priežasčių preallocateModelPanels nėra – mini saugus stub’as
    if (typeof preallocateModelPanels !== 'function') {
      window.preallocateModelPanels = function(models){
        state.modelElements = {};
        (models || []).forEach(function (m) {
          var el = addSpecialistMessage({ model: m, streaming: true, label: getModelDisplayName(m) });
          state.modelElements[m] = { element: el, content: '', completed: false, key: m, model: m, _locked: false };
        });
      };
    }

    preallocateModelPanels(selectedModels);

    // Jei neturim jokio API – rodom tik UI pranešimą ir išeinam (Vercel „demo“)
    if (!SSE_ENDPOINT) {
      addSystemMessage('API endpoint nenustatytas (static režimas).');
      return;
    }

    streamRealAPI(text, selectedModels).then(function () {
      setTimeout(function () {
        if (Object.keys(state.lastRound).length >= 2 && typeof addDebateActions === 'function') {
          addDebateActions();
        }
      }, 1500);
    }).catch(function (err) {
      showErrorNotification('Klaida siunčiant žinutę', (err && err.message) ? err.message : String(err || ''));
      if (typeof finishWithErrors === 'function') finishWithErrors();
    });
  }

  function stopStreaming() {
    try { if (state.currentEventSource) state.currentEventSource.close(); } catch (_) {}
    state.currentEventSource = null;
    state.isStreaming = false;
    if (elements.sendBtn) elements.sendBtn.disabled = false;
  }

  function startSpecialistChat(prompt, title, config) {
    if (!state.hasMessagesStarted) {
      state.hasMessagesStarted = true;
      updateBottomSectionPosition();
      hideWelcome();
    }
    addUserMessage('Klausimas: ' + title);
    state.lastUserText = prompt;

    var models = getActiveModels();
    if (typeof preallocateModelPanels === 'function') {
      preallocateModelPanels(models);
    } else {
      // Fallback stub jei neįdėtas Blokas A
      window.preallocateModelPanels && window.preallocateModelPanels(models);
    }

    if (!SSE_ENDPOINT) {
      addSystemMessage('API endpoint nenustatytas (static režimas).');
      return;
    }

    streamRealAPI(prompt, models, config).catch(function (err) {
      showErrorNotification('Klaida paleidžiant specialisto pokalbį', (err && err.message) ? err.message : String(err || ''));
      if (typeof finishWithErrors === 'function') finishWithErrors();
    });
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
      '<div class="avatar">' +
        '<img src="' + ICONS_BASE + '/mine.svg" alt="" style="width:18px;height:18px">' +
      '</div>' +
      '<div class="bubble user">' +
        '<div class="bubble-card">' +
          '<div class="msg-content">' + escapeHtml(text) + '</div>' +
          '<div class="msg-meta">' +
            '<span>' + (state.user && state.user.name ? state.user.name : 'Jūs') + '</span>' +
            '<span>' + getCurrentTime() + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';
    fadeInAppend(msg);
    scrollToBottomIfNeeded();
    return msg;
  }

  var REAL_MODEL_ICONS = {
    'gpt-4o-mini': ICONS_BASE + '/chatgpt.svg',
    'claude-4-sonnet': ICONS_BASE + '/claude-seeklogo.svg',
    'gemini-2.5-flash': ICONS_BASE + '/gemini.svg',
    'grok-4': ICONS_BASE + '/xAI.svg',
    'deepseek-chat': ICONS_BASE + '/deepseek.svg',
    'meta-llama/Llama-4-Scout-17B-16E-Instruct': ICONS_BASE + '/llama.svg'
  };
  function getIcon(model) { return REAL_MODEL_ICONS[model] || (ICONS_BASE + '/ai.svg'); }

  function addSpecialistMessage(opts) {
    opts = opts || {};
    var model = opts.model || null;
    var streaming = !!opts.streaming;
    var label = opts.label || null;
    var content = opts.content || '';
    var displayLabel = label || getModelDisplayName(model);

    if (!elements.chatArea) return null;
    var wrapper = document.createElement('div');
    wrapper.className = 'message';
    var parsedContent = streaming ? '' : parseMarkdown(content);

    wrapper.innerHTML =
      '<div class="avatar">' +
        '<img src="' + getIcon(model) + '" alt="" style="width:18px;height:18px">' +
      '</div>' +
      '<div class="bubble" data-model="' + (model || '') + '">' +
        '<div class="bubble-card">' +
          '<button class="copy-btn" title="Kopijuoti" ' +
            'onclick="(function(btn){var card=btn.closest(\\\'.bubble-card\\\');var mc=card?card.querySelector(\\\'.msg-content\\\'):null;var t=mc?mc.innerText:\\\'\\\';try{navigator.clipboard.writeText(t);btn.classList.add(\\\'ok\\\');setTimeout(function(){btn.classList.remove(\\\'ok\\\');},900);}catch(e){}})(this)" ' +
            'style="position:absolute;right:8px;top:8px;font-size:12px;border:1px solid var(--border);background:var(--bg);padding:4px 6px;border-radius:6px;cursor:pointer;opacity:.8">⧉</button>' +
          '<div class="msg-content">' + parsedContent + '</div>' +
          '<div class="msg-meta">' +
            '<span>' + escapeHtml(displayLabel) + '</span>' +
            '<span>' + getCurrentTime() + '</span>' +
            (streaming ? '<span class="typing"><span></span><span></span><span></span></span>' : '') +
          '</div>' +
        '</div>' +
      '</div>';

    fadeInAppend(wrapper);
    scrollToBottomIfNeeded();
    return wrapper.querySelector('.msg-content');
  }

  function getModelDisplayName(id) {
    var names = {
      'gpt-4o-mini': 'ChatGPT',
      'claude-4-sonnet': 'Claude',
      'gemini-2.5-flash': 'Gemini',
      'grok-4': 'Grok',
      'deepseek-chat': 'DeepSeek',
      'meta-llama/Llama-4-Scout-17B-16E-Instruct': 'Llama',
      'auto': 'Auto',
      'augam-auto': 'Auto'
    };
    return names[id] || id;
  }

  function addSystemMessage(text) {
    if (!elements.chatArea) return null;
    var el = document.createElement('div');
    el.className = 'thinking';
    el.innerHTML = '<img src="' + ICONS_BASE + '/info.svg" alt="" style="width:16px;height:16px"><span>' + text + '</span>';
    fadeInAppend(el);
    scrollToBottomIfNeeded();
    return el;
  }

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

  // =========================
  // 12) REALI API (SSE + JSON hibridas) — V3 (per-model SSE, no overwrite)
  // =========================

  var SSE_DEBUG = true;
  var FORCE_EVENTSOURCE = true;
  var SSE_WATCHDOG_MS = 9000;

  function sselog(){ try{ if (SSE_DEBUG) console.log.apply(console, ['[SSE]'].concat([].slice.call(arguments))); }catch(_){ } }

  // ——— saugi resolveTargetKey, pirmiausia naudoja panel -> _boundPanels, tada tiesioginį key ———
  if (typeof resolveTargetKey !== 'function') {
    function resolveTargetKey(payload){
      var p = payload && (payload.panel || payload.key);
      var m = payload && payload.model;
      if (p && state._boundPanels && state._boundPanels[p]) return state._boundPanels[p];
      if (m && state._boundPanels && state._boundPanels[m]) return state._boundPanels[m];
      if (p && state.modelElements && state.modelElements[p]) return p;
      if (m && state.modelElements && state.modelElements[m]) return m;
      // jeigu visai nėra – paimkite kitą neužimtą kortelę (bet realiai su mūsų prebind neturėtų prireikti)
      if (typeof takeNextUnboundModelKey === 'function') return takeNextUnboundModelKey();
      return 'auto';
    }
  }
  function _safeDebateButtons(){ try { (typeof safeDebateButtons==='function'?safeDebateButtons:checkDebateButtons)(); } catch(_){} }

  // === TRANSPORTO SKIRSTYMAS ===
  // JSON-only: Claude / Grok / Gemini
  var NON_SSE_MODELS = new Set(['claude-4-sonnet','grok-4','gemini-2.5-flash']);

  function splitModelsByTransport(frontModels) {
    var stream = [], json = [];
    (frontModels || []).forEach(function (m) {
      if (NON_SSE_MODELS.has(m)) json.push(m); else stream.push(m);
    });
    return { stream, json };
  }

  // ——— SSE URL visada per /stream (kaip senam faile) ———
  function buildStreamUrl(qsObj){
    var base = (SSE_ENDPOINT || (API_BASE ? (API_BASE + '/stream') : ''));
    if (!base) return '';
    base = String(base).replace(/\/stream-sse(?:\?.*)?$/,'/stream');
    var qs = new URLSearchParams(qsObj || {}).toString();
    return base + (base.indexOf('?') === -1 ? '?' : '&') + qs;
  }

  // ——— EventSource atidarymas ———
  function openSSE(url, handlers){
    if (!url) { handlers && handlers.error && handlers.error(new Error('No SSE URL')); return { close:function(){} }; }
    sselog('OPEN', url);
    if (FORCE_EVENTSOURCE && window.EventSource) {
      var es = new EventSource(url, { withCredentials: true });
      es.onmessage = function(e){ try { handlers && handlers.message && handlers.message(e); } catch(_){} };
      ['start','model_init','delta','answer','model_done','done','error'].forEach(function(evt){
        if (handlers && typeof handlers[evt] === 'function') es.addEventListener(evt, handlers[evt]);
      });
      es.onerror = handlers && handlers.error ? handlers.error : function(e){ sselog('ERROR(evtsrc)', e); };
      return { close: function(){ try{ es.close(); }catch(_){ } } };
    }
    try { handlers && handlers.error && handlers.error(new Error('EventSource not available')); } catch(_){}
    return { close: function(){} };
  }

  // ——— Delta į kortelę ———
  function applyDeltaRecordFromPayload(payload) {
    var key = resolveTargetKey(payload || {});
    var rec = state.modelElements[key];

    if (!rec) {
      var mdl = (payload && payload.model) || 'auto';
      var el = addSpecialistMessage({ model: mdl, streaming: true, label: getModelDisplayName(mdl) });
      rec = state.modelElements[key] = { element: el, content: '', completed: false, key: key, model: mdl, _locked: true };
    }

    var txt = (payload && (payload.text || payload.delta || payload.content)) || '';
    if (!txt) return rec;

    if (typeof removeLoadingIndicator === 'function') removeLoadingIndicator(rec.element);
    rec.content += String(txt);
    rec.element.innerHTML = parseMarkdown(rec.content);
    if (typeof scrollToBottomIfNeeded === 'function') scrollToBottomIfNeeded();
    return rec;
  }

  // ——— Final atsakymas į kortelę ———
  function applyAnswerRecordFromPayload(payload) {
    var key = resolveTargetKey(payload || {});
    var rec = state.modelElements[key];
    var txt = String((payload && (payload.text || payload.answer || payload.delta || payload.content)) || '');
    var model = (payload && payload.model) || (rec && rec.model) || key || 'auto';

    if (!rec) {
      var el = addSpecialistMessage({ model: model, streaming: false, label: getModelDisplayName(model), content: txt });
      rec = state.modelElements[key] = { element: el, content: txt, completed: true, key: key, model: model, _locked: true };
    } else {
      rec.content = txt;
      rec.completed = true;
      if (typeof removeLoadingIndicator === 'function') removeLoadingIndicator(rec.element);
      rec.element.innerHTML = parseMarkdown(rec.content);
    }

    var card = rec.element.closest('.bubble-card');
    if (card) { var t = card.querySelector('.typing'); if (t) t.remove(); }
    state.lastRound[model] = rec.content; // saugom pagal realų model id
    if (typeof scrollToBottomIfNeeded === 'function') scrollToBottomIfNeeded();
    return rec;
  }

  // ——— model_init sinchronizacija ———
  function handleModelInit(d){
    var key = resolveTargetKey(d || {});
    var rec = state.modelElements[key];
    if (!rec) return;

    var model = d.model || rec.model || key || 'auto';
    rec.model = model;

    var bubble = rec.element.closest('.bubble');
    if (bubble) bubble.setAttribute('data-model', model);

    var card = rec.element.closest('.bubble-card');
    if (card) {
      var metaFirst = card.querySelector('.msg-meta span');
      if (metaFirst) metaFirst.textContent = getModelDisplayName(model);
    }

    var avatar = bubble ? bubble.previousElementSibling : null;
    if (avatar && avatar.querySelector('img')) avatar.querySelector('img').src = getIcon(model);
  }

  // ——— Užbaigimas su klaidom ———
  function finishWithErrors() {
    Object.keys(state.modelElements).forEach(function (k) {
      var rec = state.modelElements[k];
      if (!rec) return;
      if (typeof removeLoadingIndicator === 'function') removeLoadingIndicator(rec.element);
      if (!rec.completed && !rec.content) {
        rec.element.innerHTML = '<em style="color: var(--error);">Nepavyko gauti atsakymo</em>';
      }
    });
  }

  // === PAGRINDINIS API (HIBRIDAS, per-model SSE) ===
  function streamRealAPI(message, models, specialistConfig) {
    if (!SSE_ENDPOINT) {
      addSystemMessage('API endpoint nenustatytas. Patikrinkite konfigūraciją.');
      return Promise.resolve({ ok: false });
    }

    state.isStreaming = true;
    state.debateButtonsShown = false;
    if (elements.sendBtn) elements.sendBtn.disabled = true;
    state.lastRound = {};

    // 1) skirstom į transporus
    var parts = splitModelsByTransport(models || []);
    var streamFront = parts.stream;    // streaminsim po VIENĄ SSE kiekvienam
    var jsonFront   = parts.json;      // JSON kartą kiekvienam

    var chatId = state.chatId || ('chat_' + Date.now() + '_' + Math.random().toString(36).slice(2));
    state.chatId = chatId;

    var basePayload = {
      message: specialistConfig ? (specialistConfig.systemPrompt + '\n\n' + message) : message,
      max_tokens: 4096,
      chat_id: chatId,
      _wpnonce: (window.CONFIG && window.CONFIG.nonce) || getWpNonce(),
      _t: Date.now()
    };

    // 2) iš anksto surišam paneles: frontId ir backendId → ta pati kortelė
    state._boundPanels = state._boundPanels || {};
    (streamFront.concat(jsonFront)).forEach(function(frontId){
      var backId = getBackendModelId(frontId);
      // jei preallocateModelPanels jau sukūrė korteles su key = frontId, tai susiejame abu raktus
      state._boundPanels[frontId] = frontId;
      state._boundPanels[backId]  = frontId;
    });

    // 3) laukiam kiek viso darbų
    var totalTasks = streamFront.length + jsonFront.length;
    if (totalTasks === 0) {
      state.isStreaming = false;
      if (elements.sendBtn) elements.sendBtn.disabled = false;
      return Promise.resolve({ ok: true });
    }
    function markDone(){
      totalTasks--;
      if (totalTasks <= 0){
        state.isStreaming = false;
        if (elements.sendBtn) elements.sendBtn.disabled = false;
        _safeDebateButtons();
      }
    }

    var tasks = [];

    // 4) SSE dalis — **po vieną SSE jungtį kiekvienam stream model** (jokio bendro multi-stream!)
    streamFront.forEach(function(frontId){
      var real = getBackendModelId(frontId);
      var payloadSSE = Object.assign({}, basePayload, { models: real });

      // priverstinai rodom/keičiam žymas į šitą modelį
      state._boundPanels[real] = frontId;

      var sseUrl = buildStreamUrl(payloadSSE);
      var gotAnyEvent = false;

      var watchdog = setTimeout(function(){
        if (gotAnyEvent) return;
        sselog('WATCHDOG → POST fallback (single stream:', real, ')');
        sseFallbackFetch(payloadSSE, [real]).finally(markDone);
      }, SSE_WATCHDOG_MS);
      function markEvent(){ gotAnyEvent = true; if (watchdog){ clearTimeout(watchdog); watchdog = null; } }

      // pradėkim „typing“ vizualą šiai paneliai, jei reikia
      var rec = state.modelElements[frontId];
      if (rec && rec.element && typeof addLoadingIndicator === 'function') addLoadingIndicator(rec.element, getModelDisplayName(frontId));

      var es = openSSE(sseUrl, {
        start: function(e){ markEvent(); var d = safeJson(e && e.data); if (d && d.chat_id) state.chatId = d.chat_id; },
        model_init: function(e){
          markEvent();
          var d = safeJson(e && e.data) || {};
          // užtikrinam, kad šio srauto įvykiai eitų į frontId panelę
          d.panel = d.panel || real; // jei backend nesiunčia panel – naudok real
          state._boundPanels[d.panel] = frontId;
          state._boundPanels[real]    = frontId;
          handleModelInit(d);
        },
        delta: function(e){
          markEvent();
          var d = safeJson(e && e.data) || {};
          d.panel = d.panel || real;
          state._boundPanels[d.panel] = frontId;
          applyDeltaRecordFromPayload(d);
        },
        answer: function(e){
          markEvent();
          var d = safeJson(e && e.data) || {};
          d.panel = d.panel || real;
          state._boundPanels[d.panel] = frontId;
          applyAnswerRecordFromPayload(d);
          _safeDebateButtons();
        },
        message: function(e){
          markEvent();
          var g = parseGenericMessage((e && e.data) || '');
          // pririšam prie šitos panelės
          var payload = g.raw || { text: g.text, model: real, panel: real };
          payload.panel = payload.panel || real;
          state._boundPanels[payload.panel] = frontId;

          if (g.type === 'done' || g.type === 'end' || g.type === 'complete') {
            if (typeof this.done === 'function') this.done();
            return;
          }
          if (g.type === 'answer' || g.type === 'final') {
            applyAnswerRecordFromPayload(payload);
            _safeDebateButtons();
          } else {
            applyDeltaRecordFromPayload(payload);
          }
        },
        model_done: function(e){
          markEvent();
          var d = safeJson(e && e.data) || {};
          d.panel = d.panel || real;
          var key = resolveTargetKey(d);
          var rec = state.modelElements[key];
          if (rec){
            rec.completed = true;
            if (typeof removeLoadingIndicator === 'function') removeLoadingIndicator(rec.element);
            var card = rec.element.closest('.bubble-card');
            if (card) { var t = card.querySelector('.typing'); if (t) t.remove(); }
          }
          _safeDebateButtons();
        },
        done: function(){
          markEvent();
          try { es.close && es.close(); } catch(_){}
          if (state.currentEventSource === es) state.currentEventSource = null;
          markDone();
        },
        error: function(err){
          sselog('error', real, err);
          if (!gotAnyEvent) {
            sseFallbackFetch(payloadSSE, [real]).finally(markDone);
          } else {
            finishWithErrors(); // pažymim tik šito modelio kortelę, jei tuščia
            markDone();
          }
        }
      });

      state.currentEventSource = es; // paskutinis aktyvus (nereikalinga, bet paliekam)
      tasks.push(Promise.resolve());
    });

    // 5) JSON-only dalis — po VIENĄ POST kiekvienam (Claude/Grok/Gemini)
    if (jsonFront.length) {
      tasks.push(
        postOnceForModels(basePayload, jsonFront.map(getBackendModelId)).finally(markDone)
      );
    }

    return Promise.all(tasks).then(function(){ return { ok: true }; });
  }

  // ——— POST fallback bendras (naudojam /stream?mode=once) ———
  function sseFallbackFetch(payload, backendModels) {
    var base = (SSE_ENDPOINT || (API_BASE ? (API_BASE + '/stream') : ''));
    if (!base) return Promise.resolve();
    base = String(base).replace(/\/stream-sse(?:\?.*)?$/, '/stream');
    var url = base + (base.indexOf('?')===-1 ? '?mode=once' : '&mode=once');
    sselog('FALLBACK POST', url, payload);

    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': (window.CONFIG && window.CONFIG.nonce) || getWpNonce()
      },
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
        // surišam su esama panelė: backendId -> frontId
        var frontId = (state._boundPanels && state._boundPanels[real]) || real;
        applyAnswerRecordFromPayload({ model: real, panel: frontId, text: item.text });
      });
    })
    .catch(function (e) {
      console.error('[AUGAM] Fallback fetch failed:', e);
      showErrorNotification('Nepavyko gauti atsakymo', e.message || String(e));
    });
  }

  // ——— JSON-ONLY POST po VIENĄ modelį (Claude/Grok/Gemini) ———
  function postOnceForModels(basePayload, backendModels) {
    return Promise.all(backendModels.map(function(realModel){
      return postOnceForSingleModel(basePayload, realModel);
    }));
  }

  function postOnceForSingleModel(basePayload, realModel){
    var body = Object.assign({}, basePayload, {
      model: realModel,
      models: realModel,
      mode: 'once'
    });

    var base = (SSE_ENDPOINT || (API_BASE ? (API_BASE + '/stream') : ''));
    if (!base) return Promise.resolve();
    base = String(base).replace(/\/stream-sse(?:\?.*)?$/, '/stream');
    var url = base + (base.indexOf('?') === -1 ? '?mode=once' : '&mode=once');

    // surišam backendId -> frontId (jei dar nesurišta)
    state._boundPanels = state._boundPanels || {};
    state._boundPanels[realModel] = state._boundPanels[realModel] || realModel;

    return fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'X-WP-Nonce': (window.CONFIG && window.CONFIG.nonce) || getWpNonce()
      },
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
      if (Array.isArray(data.answers)) {
        data.answers.forEach(function (item) {
          var mdl = item.model || realModel;
          var fr  = (state._boundPanels && state._boundPanels[mdl]) || frontId;
          applyAnswerRecordFromPayload({ model: mdl, panel: fr, text: item.text });
        });
      } else {
        var txt = data.text || data.answer || '';
        applyAnswerRecordFromPayload({ model: realModel, panel: frontId, text: txt });
      }
    })
    .catch(function(e){
      console.error('[AUGAM] postOnceForSingleModel fail:', realModel, e);
      showErrorNotification('Nepavyko gauti JSON atsakymo ('+ realModel +')', e.message || String(e));
    });
  }

  // ——— universalus parseris „message“ ———
  function parseGenericMessage(dataStr){
    var o = safeJson(dataStr);
    if (!o) return { type:'delta', text:dataStr, key:'', model:null, raw:null };
    var type = o.event || o.type || (o.done ? 'done' : (o.answer ? 'answer' : (o.delta ? 'delta' : 'delta')));
    var text = o.text || o.delta || o.answer || o.content || '';
    var key  = o.panel || o.key || o.model || '';
    var model= o.model || null;
    return { type:type, text:text, key:key, model:model, raw:o };
  }
  // === END 12 BLOKAS (V3) ===

  
  // =========================
  // 13) /models įkėlimas
  // =========================
  function loadAvailableModels() {
    // Jeigu neturime endpointo – baigiam tyliai (STATIC režime UI suveiks per initialize()).
    if (!window.CONFIG || !window.CONFIG.restModels) return;
    fetch(window.CONFIG.restModels, {
      headers: {
        'X-WP-Nonce': window.CONFIG.nonce || getWpNonce(),
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    })
      .then(function (res) {
        if (!res.ok) {
          if (res.status === 404) showErrorNotification('Modelių endpoint nerastas (404).', 'Patikrinkite ar /wp-json/augam/v1/models registruotas.');
          else if (res.status === 403) showErrorNotification('Nepavyko įkelti AI modelių (403).', 'Patikrink WP nonce injekciją ir REST leidimus.');
          throw new Error('HTTP ' + res.status + ': ' + res.statusText);
        }
        return res.json();
      })
      .then(function (data) {
        if (data.ok && Array.isArray(data.available)) {
          state.availableModels = [{ id: 'augam-auto', alias: 'Auto' }].concat(data.available);
          updateModelPills();
        } else {
          throw new Error('Invalid response format');
        }
      })
      .catch(function (err) {
        console.error('[AUGAM] Models load failed:', err);
        showErrorNotification('Nepavyko įkelti AI modelių', err.message || String(err));
        state.availableModels = [];
        updateModelPills(true);
      });
  }

  // =========================
  // 14) GINČŲ VEIKSMAI
  // =========================
  function addDebateActions() {
    var old = document.querySelector('.debate-actions');
    if (old && old.parentNode) old.remove();
    var box = document.createElement('div');
    box.className = 'debate-actions';
    box.innerHTML =
      '<button class="action-btn" onclick="window.AugamMain.startDebate()">Pradėti ginčą</button>' +
      '<button class="action-btn secondary" onclick="window.AugamMain.getJudgment()">Gauti teisėjo nuomonę</button>' +
      '<button class="action-btn secondary" onclick="window.AugamMain.findCompromise()">Rasti kompromisą</button>';
    if (elements.chatArea) elements.chatArea.appendChild(box);
    scrollToBottom();
  }
  function startDebate() {
    hideDebateActions();
    var debateModels = getModelsForDebate();
    if (debateModels.length < 2) {
      addSystemMessage('Ginčui reikia bent 2 modelių. Pasirinkite modelius viršuje.');
      setTimeout(addDebateActions, 1200);
      return;
    }
    addSystemMessage('Pradedamas AI ginčas su ' + debateModels.length + ' modeliais: ' + debateModels.map(getModelDisplayName).join(', '));
    var debatePrompt =
      'GINČO POZICIJA: "' + state.lastUserText + '"\n\n' +
      'Tavo užduotis ginče:\n' +
      '1. Pateik AIŠKIĄ ir ARGUMENTUOTĄ savo poziciją\n' +
      '2. Kritikuok silpnas kitų modelių pozicijas\n' +
      '3. Pateik KONKRETIUS pavyzdžius ir duomenis\n' +
      '4. Būk ĮTIKINANTIS ir aiškiai suformuluok galutinę poziciją\n' +
      '5. Ginčykis drąsiai - tai GINČAS, o ne bendradarbiavimas!';
    state.modelElements = {};
    if (!SSE_ENDPOINT) {
      addSystemMessage('API endpoint nenustatytas (static režimas).');
      return;
    }
    streamRealAPI(debatePrompt, debateModels).then(function () {
      setTimeout(addPostDebateActions, 1800);
    });
  }
  function getJudgment() {
    hideDebateActions();
    addSystemMessage('AI teisėjas analizuoja visas pozicijas...');
    var judgingPrompt =
      'Tu esi objektyvus AI teisėjas. Analizuok šiuos atsakymus į klausimą: "' + state.lastUserText + '"\n\n' +
      Object.keys(state.lastRound).map(function (model) {
        return '=== ' + getModelDisplayName(model) + ' ===\n' + (state.lastRound[model] || '') + '\n';
      }).join('\n') +
      '\nDuok objektyvų vertinimą:\n\n' +
      '1. ĮVERTINIMAI (balai 70-100):\n' +
      '   - Faktų tikslumas (30%)\n' +
      '   - Argumentų logika (25%)\n' +
      '   - Praktinis pritaikymas (25%)\n' +
      '   - Aiškumas ir išsamumas (20%)\n\n' +
      '2. NUGALĖTOJAS: Nurodyti kurį modelį ir kodėl\n\n' +
      '3. APIBENDRINIMAS: Bendros išvados ir rekomendacijos (3-4 sakiniai)';
    state.modelElements = {};
    if (!SSE_ENDPOINT) { addSystemMessage('API endpoint nenustatytas (static režimas).'); return; }
    streamRealAPI(judgingPrompt, ['auto']);
  }
  function findCompromise() {
    hideDebateActions();
    addSystemMessage('AI modeliai ieško kompromiso...');
    var combinedResponses = Object.keys(state.lastRound).map(function (model) {
      return '=== ' + getModelDisplayName(model) + ' pozicija ===\n' + (state.lastRound[model] || '');
    }).join('\n\n');
    var compromisePrompt =
      'KOMPROMISO PAIEŠKA\n\n' +
      'Išanalizuok visas pozicijas ir rask PROTINGĄ KOMPROMISĄ:\n\n' +
      combinedResponses + '\n\n' +
      'Tavo užduotis:\n' +
      '1) Išanalizuok stiprybes/silpnybes\n' +
      '2) Pasiūlyk bendrą sprendimą\n' +
      '3) Paaiškink kodėl tai geriausia\n' +
      '4) Pateik trumpą veiksmų planą';
    state.modelElements = {};
    if (!SSE_ENDPOINT) { addSystemMessage('API endpoint nenustatytas (static režimas).'); return; }
    streamRealAPI(compromisePrompt, ['claude-4-sonnet']);
  }
  function addPostDebateActions() {
    var box = document.createElement('div');
    box.className = 'debate-actions';
    box.innerHTML =
      '<button class="action-btn" onclick="window.AugamMain.getJudgment()">Teisėjas</button>' +
      '<button class="action-btn secondary" onclick="window.AugamMain.findCompromise()">Kompromisas</button>' +
      '<button class="action-btn secondary" onclick="window.AugamMain.continueDebate()">Tęsti ginčą</button>';
    if (elements.chatArea) elements.chatArea.appendChild(box);
    scrollToBottom();
  }
  function continueDebate() { hideDebateActions(); addSystemMessage('Pridėkite naują klausimą, kad tęstumėte diskusiją...'); }
  function hideDebateActions() {
    var el = document.querySelector('.debate-actions');
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }
  function getModelsForDebate() {
    var participated = Object.keys(state.lastRound);
    if (participated.length >= 2) return participated;
    if (state.selectedModels.indexOf('augam-auto') !== -1 || state.selectedModels.length === 0) {
      return ['gpt-4o-mini', 'claude-4-sonnet', 'grok-4'];
    }
    return state.selectedModels.slice();
  }

  //===== START: 15) PAGALBINIAI (be scrollToBottomIfNeeded dublikato) =====/
  function generateChatId() { return 'chat_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11); }

  function addLoadingIndicator(contentEl, modelName) {
    if (!contentEl) return;
    contentEl.innerHTML =
      '<div class="thinking">' +
      '<div class="loading-dots"><span></span><span></span><span></span></div>' +
      '<span style="margin-left: 12px; color: var(--text-muted);">' + modelName + ' analizuoja...</span>' +
      '</div>';
  }
  function removeLoadingIndicator(contentEl) {
    if (!contentEl) return;
    var el = contentEl.querySelector('.thinking');
    if (el) {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s ease';
      setTimeout(function () { if (el && el.parentNode) el.parentNode.removeChild(el); }, 280);
    }
  }

  function setInitialModelSelection() {
    if (!elements.modelList) return;
    var pills = elements.modelList.querySelectorAll('.model-pill');
    for (var i = 0; i < pills.length; i++) pills[i].classList.remove('active');
    var autoPill = elements.modelList.querySelector('[data-model="augam-auto"]');
    if (autoPill) autoPill.classList.add('active');
  }

  function initializeWelcomeActions() {
    var arr = document.querySelectorAll('.welcome-btn');
    for (var i = 0; i < arr.length; i++) {
      arr[i].addEventListener('click', function (e) {
        var action = e.currentTarget.getAttribute('data-action');
        if (action && window.AugamSpecialist && window.AugamSpecialist.open) window.AugamSpecialist.open(action);
      });
    }
  }

  function initializeUserAuth() {
    try {
      var saved = localStorage.getItem('augam_user');
      if (saved) { state.user = JSON.parse(saved); updateUserInterface(); }
    } catch (_) {}
  }

  function loadProjects() {
    state.projects = [
      { id: 'research', name: 'AI Tyrimai #1', type: 'research', updated: '2025-01-15' },
      { id: 'code', name: 'Kodo analizė #2', type: 'code', updated: '2025-01-14' },
      { id: 'business', name: 'Verslo strategija #3', type: 'business', updated: '2025-01-13' }
    ];
    updateProjectsList();
  }

  /* ⬇️ buvusi loadChatHistory() pervadinta į seedChatHistory(), kad nesikirstų su atidarymo funkcija */
  function seedChatHistory() {
    state.chatHistory = [
      { id: 'recent1', title: 'Sveikatos konsultacija', specialist: 'doctor',  date: '2025-01-15', preview: 'Klausimai apie karščiavimą...' },
      { id: 'recent2', title: 'Verslo strategija',       specialist: 'business',date: '2025-01-14', preview: 'Startup plėtros planai...' },
      { id: 'recent3', title: 'Receptų paieška',         specialist: 'chef',    date: '2025-01-13', preview: 'Sveikų patiekalų receptai...' },
      { id: 'recent4', title: 'Teisinė konsultacija',    specialist: 'lawyer',  date: '2025-01-12', preview: 'Sutarčių peržiūra...' },
      { id: 'recent5', title: 'Marketing strategija',    specialist: 'marketer',date: '2025-01-11', preview: 'Social media planas...' }
    ];
    updateHistoryList();
  }

  function updateModelPills(forceEnableAll) {
    if (!elements.modelList) return;
    var ids = (!forceEnableAll && state.availableModels.length)
      ? new Set(state.availableModels.map(function (m) { return m.id; }))
      : null;

    var pills = elements.modelList.querySelectorAll('.model-pill[data-model]');
    for (var i = 0; i < pills.length; i++) {
      var id = pills[i].getAttribute('data-model') || '';
      var enabled = (id === 'augam-auto') || (ids ? ids.has(id) : true);
      pills[i].style.opacity = enabled ? '1' : '0.55';
      pills[i].style.pointerEvents = enabled ? 'auto' : 'none';
      pills[i].title = enabled ? '' : 'Modelis neprieinamas';
    }
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



  // =========================
  // 16) AUTH (demo) — saugus Safari/WebKit
  // =========================
  function updateUserInterface() {
    if (state.user) {
      if (elements.btnLogin)      elements.btnLogin.classList.add('hidden');
      if (elements.userProfile)   elements.userProfile.classList.remove('hidden');

      var initials = (state.user.name || 'U').split(' ').map(function (n) { return n ? n[0] : ''; }).join('').toUpperCase();

      var av = document.getElementById('userAvatar'); if (av) av.textContent = initials;
      var nm = document.getElementById('userName');   if (nm) nm.textContent = state.user.name || 'Vartotojas';
    } else {
      if (elements.btnLogin)      elements.btnLogin.classList.remove('hidden');
      if (elements.userProfile)   elements.userProfile.classList.add('hidden');
      var av2 = document.getElementById('userAvatar'); if (av2) av2.textContent = 'U';
      var nm2 = document.getElementById('userName');   if (nm2) nm2.textContent = 'Vartotojas';
    }
  }
  function openLoginModal() { if (elements.loginModalOverlay) elements.loginModalOverlay.classList.add('active'); }
  function closeLoginModal() { if (elements.loginModalOverlay) elements.loginModalOverlay.classList.remove('active'); }

  function handleGoogleLogin() {
    addSystemMessage('Prisijungiama su Google...');
    setTimeout(function () {
      var fakeUser = { id: 'google_123456', name: 'Tomas Petras', email: 'tomas.petras@gmail.com', avatar: null, provider: 'google' };
      state.user = fakeUser;
      try { localStorage.setItem('augam_user', JSON.stringify(fakeUser)); } catch (_) {}
      updateUserInterface();
      closeLoginModal();
      addSystemMessage('Sėkmingai prisijungėte su Google!');
    }, 1000);
  }
  function handleEmailLogin() {
    var emailEl = document.getElementById('loginEmail');
    var passEl  = document.getElementById('loginPassword');
    var email   = emailEl ? String(emailEl.value || '').trim() : '';
    var password= passEl  ? String(passEl.value  || '').trim() : '';
    if (!email || !password) { showErrorNotification('Prašome užpildyti visus laukus'); return; }

    addSystemMessage('Prisijungiama...');
    setTimeout(function () {
      var fakeUser = { id: 'email_789', name: email.split('@')[0] || 'Vartotojas', email: email, avatar: null, provider: 'email' };
      state.user = fakeUser;
      try { localStorage.setItem('augam_user', JSON.stringify(fakeUser)); } catch (_) {}
      updateUserInterface();
      closeLoginModal();
      addSystemMessage('Sėkmingai prisijungėte!');
    }, 800);
  }
  function handleLogout() {
    state.user = null;
    try { localStorage.removeItem('augam_user'); } catch (_) {}
    updateUserInterface();
    addSystemMessage('Sėkmingai atsijungėte!');
  }

  //===== START: 17) PROJEKTAI / ISTORIJA (demo) (su seedChatHistory) =====/
  function updateProjectsList() {
    var list = document.getElementById('projectsList'); if (!list) return;
    var newItem = list.querySelector('[data-project="new"]');
    list.innerHTML = '';
    if (newItem) list.appendChild(newItem);
    (state.projects || []).forEach(function (p) {
      var el = document.createElement('div');
      el.className = 'project-item';
      el.setAttribute('data-project', p.id);
      el.innerHTML = '<img src="' + getProjectIcon(p.type) + '" alt="" style="width:14px;height:14px">' + p.name;
      el.addEventListener('click', function () { loadProject(p.id); });
      list.appendChild(el);
    });
  }

  function updateHistoryList() {
    var list = document.getElementById('historyList'); if (!list) return;
    list.innerHTML = '';
    (state.chatHistory || []).forEach(function (h) {
      var el = document.createElement('div');
      el.className = 'project-item';
      el.setAttribute('data-history', h.id);
      var icon = getSpecialistIcon(h.specialist);
      el.innerHTML = '<img src="' + icon + '" alt="" style="width:14px;height:14px">' + h.title;
      el.addEventListener('click', function () { loadChatHistory(h.id); });
      list.appendChild(el);
    });
  }

  function getProjectIcon(type) {
    var map = {
      research: ICONS_BASE + '/tool-research.svg',
      code: ICONS_BASE + '/tool-code.svg',
      business: ICONS_BASE + '/business-strategy.svg'
    };
    return map[type] || (ICONS_BASE + '/project.svg');
  }

  function getSpecialistIcon(name) {
    var map = {
      doctor: ICONS_BASE + '/medical-stethoscope.svg',
      chef: ICONS_BASE + '/chef-knife.svg',
      business: ICONS_BASE + '/business-strategy.svg',
      marketer: ICONS_BASE + '/marketing-megaphone.svg',
      lawyer: ICONS_BASE + '/legal-contract.svg'
    };
    return map[name] || (ICONS_BASE + '/nav-chat.svg');
  }

  function loadProject(id) {
    addSystemMessage('Įkeliamas projektas: ' + id);
    state.currentProject = id;
    var all = document.querySelectorAll('[data-project]');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    var cur = document.querySelector('[data-project="' + id + '"]');
    if (cur) cur.classList.add('active');
  }

  /* ✅ Nauja: pradinė demo istorija */
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

  /* 🔁 Suderinamumas: jei kur nors dar kviečiam be ID — suseedinam */
  function loadChatHistory(id) {
    if (typeof id === 'undefined' || id === null) {
      return seedChatHistory();
    }
    var chat = (state.chatHistory || []).find(function (c) { return c.id === id; });
    if (!chat) return;
    addSystemMessage('Įkeliama pokalbių istorija: ' + chat.title);
    var all = document.querySelectorAll('[data-history]');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    var cur = document.querySelector('[data-history="' + id + '"]');
    if (cur) cur.classList.add('active');
  }




  // =========================
  // 18) STATISTIKA (demo)
  // =========================
  function showModelStats(key) {
    var s = state.stats[key];
    if (!s) return;
    var winRate = Math.round((s.wins / s.total) * 100);
    addSystemMessage('📊 ' + key.toUpperCase() + ': ' + winRate + '% pergalių iš ' + s.total + ' ginčų (' + s.wins + ' pergalės)');
  }
  function updateStatsDisplay() {
    var keys = Object.keys(state.stats);
    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var el = document.querySelector('.stats-grid .stat-chip [data-model="' + key + '"]');
      if (el) {
        var stats = state.stats[key];
        var text = stats.total > 0 ? (Math.round((stats.wins / stats.total) * 100) + '% (' + stats.total + ')') : '0';
        el.textContent = text;
      }
    }
  }

  // =========================
  // 19) UTIL (auto-scroll, saugus Markdown, kopijavimo mygtukas)
  // =========================
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

  /* ───────── „lipnus“ scroll: auto-scroll tik kai vartotojas apačioje ───────── */
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
  // bandome prisikabinti dabar ir dar kelis kartus vėliau (jei chatArea atsiras vėliau)
  attachChatScrollListener();
  (function retryHook(i){
    if (i<=0) return;
    setTimeout(function(){ attachChatScrollListener(); retryHook(i-1); }, 500);
  })(8);

  function scrollToBottom(){
    if (!elements || !elements.chatArea) return;
    elements.chatArea.scrollTop = elements.chatArea.scrollHeight;
  }
  function scrollToBottomIfNeeded(){
    if (!elements || !elements.chatArea) return;
    if (state.stickToBottom) elements.chatArea.scrollTop = elements.chatArea.scrollHeight;
  }
  function maybeAutoscroll(force){
    if (!elements || !elements.chatArea) return;
    if (force || state.stickToBottom) scrollToBottom();
  }

  /* ───────── bendros smulkios pagalbinės ───────── */
  function getCurrentTime(){
    return new Date().toLocaleTimeString('lt-LT', { hour:'2-digit', minute:'2-digit' });
  }
  function escapeHtml(text){
    var div = document.createElement('div');
    div.textContent = (text == null ? '' : text);
    return div.innerHTML;
  }
  function safeJson(s){ try{ return JSON.parse(s); }catch(_){ return null; } }

  /* ───────── kopijavimo mygtukas ant atsakymo kortelės ───────── */
  function addCopyControl(contentEl){
    if (!contentEl) return;
    var card = contentEl.closest && contentEl.closest('.bubble-card');
    if (!card || card.querySelector('.copy-btn')) return;

    var btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.title = 'Kopijuoti';
    btn.innerHTML = '⧉';
    btn.style.cssText = 'position:absolute;top:8px;right:8px;background:transparent;border:none;cursor:pointer;opacity:.6;font-size:14px;';
    btn.onclick = function () {
      var picked = (window.getSelection && String(window.getSelection()).trim()) || '';
      var text = picked || contentEl.innerText || '';
      navigator.clipboard.writeText(text).then(function(){
        btn.style.opacity = '1';
        setTimeout(function(){ btn.style.opacity = '.6'; }, 600);
      });
    };
    card.style.position = 'relative';
    card.appendChild(btn);
  }

  /* ───────── saugus Markdown (be bugiško <ul> „apvyniojimo“) ─────────
     • HTML visada escapinamas
     • Palaikomi #, ##, ###…; **bold**, *italic*, `code`
     • Sąrašai „- “ arba „* “ grupuojami į vieną <ul> be drebėjimų
     • Tuščios eilutės → <br>
  */
  function parseMarkdown(text){
    if (!text) return '';

    // 1) HTML escape
    var s = escapeHtml(String(text));

    // 2) antraštės + inline stiliai
    s = s
      .replace(/^###### (.*)$/gim, '<h6>$1</h6>')
      .replace(/^##### (.*)$/gim, '<h5>$1</h5>')
      .replace(/^#### (.*)$/gim, '<h4>$1</h4>')
      .replace(/^### (.*)$/gim, '<h3>$1</h3>')
      .replace(/^## (.*)$/gim, '<h2>$1</h2>')
      .replace(/^# (.*)$/gim, '<h1>$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>');

    // 3) eilutėmis -> <ul><li>…</li></ul> ir <p>…</p>
    var lines = s.split(/\n/);
    var out = [], inList = false, lastWasBr = false;

    function closeList(){ if (inList){ out.push('</ul>'); inList=false; } }

    for (var i=0; i<lines.length; i++){
      var line = lines[i];
      var m = line.match(/^\s*[-*]\s+(.+)$/); // sąrašas
      if (m){
        if (!inList){ out.push('<ul>'); inList = true; lastWasBr=false; }
        out.push('<li>' + m[1] + '</li>');
        continue;
      }

      // ne sąrašas
      closeList();
      var t = line.trim();

      if (t===''){
        if (!lastWasBr){ out.push('<br>'); lastWasBr=true; }
        continue;
      }
      lastWasBr=false;

      // jei jau yra heading (<h1>…</h1>) – neapvyniojam <p>
      if (/^<h[1-6]>/.test(t) || /^<ul>/.test(t) || /^<\/ul>/.test(t)){
        out.push(t);
      } else {
        out.push('<p>' + line + '</p>');
      }
    }
    closeList();

    return out.join('');
  }


  // =========================
  // 20) TEST REŽIMAS (?augam-test=1)
  // =========================
  function isTestMode() { return new URLSearchParams(location.search).has('augam-test'); }
  function runSelfTestUI() {
    var badge = document.createElement('div');
    badge.className = 'error-notification';
    badge.style.background = '#ecfeff';
    badge.style.borderColor = '#a5f3fc';
    badge.style.color = '#0e7490';
    badge.innerHTML = 'AUGAM JS veikia 🎉 <small style="opacity:.7;display:block">Pašalink „?augam-test=1“ query, jei nebenori šio pranešimo</small>';
    document.body.appendChild(badge);
    setTimeout(function () { if (badge && badge.parentNode) badge.remove(); }, 5000);
  }

  // =========================
  // 21) GLOBALUS EKSPORTAS
  // =========================
  function openCreativePopupPublic(popupId) { openCreativePopup(popupId); }
  window.showModelStats = showModelStats;
  window.AugamMain = {
    initialize: initialize,
    startSpecialistChat: startSpecialistChat,
    startDebate: startDebate,
    getJudgment: getJudgment,
    findCompromise: findCompromise,
    continueDebate: continueDebate,
    state: state,
    elements: elements,
    openCreativePopup: openCreativePopupPublic,
    __selfTest: function () { return 'ok'; }
  };

  // =========================
  // 22) START
  // =========================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  console.log('[AUGAM] ========================================');
  console.log('[AUGAM] 🚀 REAL API IMPLEMENTATION LOADED');
  console.log('[AUGAM] ✅ SSE Streaming su Auto→real model pervadinimu');
  console.log('[AUGAM] ✅ Automatinis POST fallback, kai query per ilgas SSE’ui');
  console.log('[AUGAM] ✅ WordPress REST API integration (nonce)');
  console.log('[AUGAM] ✅ Vercel STATIC režimo apsaugos');
  console.log('[AUGAM] ========================================');
  
  
  //=== AUGAM UI STREAM CLIENT – START (SAFE DROP-IN) =========================
(() => {
  'use strict';

  // Jei jau veikia didysis AUGAM Main UI – nesi-inicializuojam automatiškai
  const AUTO_INIT = !window.AugamMain;

  // Endpoint su subdir palaikymu (veiks ir /wp-json/ root)
  const ENDPOINT_ROOT = (window.wpApiSettings?.root || '/wp-json/');
  const ENDPOINT = ENDPOINT_ROOT.replace(/\/+$/, '') + '/augam/v1/stream';

  // DOM inkaro vietos pagal TAVO HTML
  const $ = (sel, root=document) => root.querySelector(sel);
  const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));
  const chatArea   = $('#chatArea');
  const msgInput   = $('#messageInput');
  const sendBtn    = $('#sendBtn');
  const newChatBtn = $('#btnNewChat');
  const modelPills = $$('.model-pill');

  // Būsena
  let es = null;                 // aktyvus EventSource
  const panels = new Map();      // panelId -> DOM node
  let currentChatId = null;      // paskutinis chat_id

  // Safari CSS.escape polyfill
  if (!window.CSS) window.CSS = {};
  if (typeof window.CSS.escape !== 'function') {
    window.CSS.escape = s => String(s).replace(/[^a-zA-Z0-9_\-]/g, m => '\\' + m);
  }

  function panelKey(p){
    return p.panel || (p.chat_id && p.model ? (p.chat_id + '::' + p.model) : null);
  }

  function ensurePanel(payload) {
    const key = panelKey(payload);
    if (!key) return null;
    if (panels.has(key)) return panels.get(key);

    const node = document.createElement('div');
    node.className = 'panel';
    node.id = `panel-${key}`;
    node.dataset.panel = key;
    node.innerHTML = `
      <div class="head">
        <div class="title">${escapeHtml(payload.alias || payload.model || 'Model')}</div>
        <div class="status">…</div>
      </div>
      <div class="body" style="white-space:pre-wrap;"></div>
    `;
    chatArea?.appendChild(node);
    panels.set(key, node);
    return node;
  }

  function setStatus(node, s){
    const t = node?.querySelector('.status');
    if (t) t.textContent = s;
  }
  function appendText(node, txt){
    const body = node?.querySelector('.body');
    if (!body) return;
    body.textContent += (txt || '');
    chatArea?.scrollTo({ top: chatArea.scrollHeight, behavior: 'smooth' });
  }
  function clearChatUI(){
    panels.clear();
    if (chatArea) chatArea.innerHTML = '';
  }
  function escapeHtml(x){
    return String(x).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

  function getSelectedModelsCSV(){
    const active = $$('.model-pill.active');
    if (!active.length) return 'augam-auto';
    return active.map(x => x.getAttribute('data-model') || '').filter(Boolean).join(',');
  }

  function bindModelPills(){
    modelPills.forEach(pill => {
      pill.addEventListener('click', () => {
        pill.classList.toggle('active');
        const anyActive = $$('.model-pill.active').length > 0;
        if (!anyActive) $('.model-pill[data-model="augam-auto"]')?.classList.add('active');
      });
    });
  }

  function newChat(){
    currentChatId = null;
    clearChatUI();
    if (msgInput) { msgInput.value = ''; msgInput.focus(); }
  }

  // ====== STREAM (SSE) ======
  function openSSE(message, modelsCSV, chatId){
    if (!message) return;

    if (es) { try { es.close(); } catch(_){} es = null; }
    clearChatUI();

    const url = new URL(ENDPOINT, location.origin);
    url.searchParams.set('message', message);
    if (modelsCSV) url.searchParams.set('models', modelsCSV);
    if (chatId)    url.searchParams.set('chat_id', chatId);

    if (!('EventSource' in window)) return postOnceJSON(message, modelsCSV, chatId);

    es = new EventSource(url.toString());

    es.addEventListener('start', (e) => {
      const data = safeJSON(e.data);
      if (data?.chat_id) currentChatId = data.chat_id;
    });

    es.addEventListener('model_init', (e) => {
      const p = safeJSON(e.data); if (!p) return;
      const node = ensurePanel(p);
      if (node) setStatus(node, '…');
    });

    es.addEventListener('delta', (e) => {
      const p = safeJSON(e.data); if (!p) return;
      const node = ensurePanel(p);
      if (node) appendText(node, p.text || '');
    });

    es.addEventListener('answer', (e) => {
      const p = safeJSON(e.data); if (!p) return;
      const node = ensurePanel(p);
      if (!node) return;
      const body = node.querySelector('.body');
      if (p.text && body && !body.textContent) appendText(node, p.text);
    });

    es.addEventListener('model_done', (e) => {
      const p = safeJSON(e.data); if (!p) return;
      const node = ensurePanel(p);
      if (node) setStatus(node, '✓');
    });

    es.addEventListener('judge_summary', (e) => {
      const j = safeJSON(e.data); if (!j?.final_answer) return;
      const payload = {
        panel: (currentChatId || 'chat') + '::AI_JUDGE',
        alias: j.model_alias || 'AI Judge',
        model: 'AI_JUDGE',
        chat_id: currentChatId || 'chat'
      };
      const node = ensurePanel(payload);
      appendText(node, j.final_answer);
      setStatus(node, '✓');
    });

    es.addEventListener('error', (e) => {
      try {
        const p = JSON.parse(e.data);
        const node = ensurePanel(p);
        if (node) setStatus(node, '⚠︎ ' + (p.error || 'error'));
      } catch {}
    });

    es.addEventListener('done', () => { try { es.close(); } catch(_){} es = null; });
    es.onerror = () => { /* be auto-reconnect */ };
  }

  // ====== JSON (kartą, be stream) ======
  async function postOnceJSON(message, modelsCSV, chatId){
    const body = { mode:'once', message, models: modelsCSV, chat_id: chatId };
    let data = null;
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify(body)
      });
      data = await res.json();
    } catch (err) {
      console.error('postOnceJSON error:', err);
      return;
    }

    currentChatId = data?.chat_id || currentChatId;
    clearChatUI();

    for (const a of (data?.answers || [])) {
      const node = ensurePanel(a);
      if (node) {
        node.querySelector('.title').textContent = a.alias || a.model || 'Model';
        appendText(node, a.text || '');
        setStatus(node, a.ok ? '✓' : '⚠︎');
      }
    }

    if (data?.judge?.final_answer) {
      const j = {
        panel: (currentChatId || 'chat') + '::AI_JUDGE',
        alias: (data.judge.label || 'AI Judge'),
        model: 'AI_JUDGE',
        chat_id: currentChatId || 'chat'
      };
      const node = ensurePanel(j);
      appendText(node, data.judge.final_answer);
      setStatus(node, '✓');
    }
  }

  // ====== UI Renginiai (tik jei AUTO_INIT) ======
  function bindInput(){
    msgInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendCurrent();
      }
    });
    sendBtn?.addEventListener('click', sendCurrent);
    newChatBtn?.addEventListener('click', newChat);
  }

  function sendCurrent(){
    const message = (msgInput?.value || '').trim();
    if (!message) return;
    const modelsCSV = getSelectedModelsCSV();
    openSSE(message, modelsCSV, currentChatId || undefined);
    if (msgInput) msgInput.value = '';
  }

  function safeJSON(str){ try { return JSON.parse(str); } catch(_) { return null; } }

  document.addEventListener('DOMContentLoaded', () => {
    if (!AUTO_INIT) return; // didysis UI valdo – šis nesikiša
    bindModelPills();
    bindInput();
    $$('.welcome-btn[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const action = btn.getAttribute('data-action');
        const presets = {
          doctor:   'Turiu galvos skausmą ir nedidelį karščiavimą. Ką patartum?',
          chef:     'Padėk su vakariene trims žmonėms: greita, pigu, be laktozės.',
          business: 'Idėjos smulkiam verslui Lietuvoje su minimaliu biudžetu.'
        };
        if (msgInput) msgInput.value = presets[action] || '';
        msgInput?.focus();
      });
    });
  });

  // === Meniu (mobile/off-canvas) ===
const btnMobile = document.getElementById('btnMobile');
const sidebar   = document.getElementById('sidebar');
if (btnMobile && sidebar) {
  btnMobile.addEventListener('click', () => {
    sidebar.classList.toggle('open');         // jūsų CSS jau turi .sidebar.open
  });
}

// === Prisijungti modalas ===
const btnLogin   = document.getElementById('btnLogin');
const authModal  = document.getElementById('authModal');
const authClose  = document.getElementById('authClose');

function openAuth(){ authModal?.classList.add('open'); }
function closeAuth(){ authModal?.classList.remove('open'); }

btnLogin?.addEventListener('click', openAuth);
authClose?.addEventListener('click', closeAuth);
authModal?.addEventListener('click', (e)=>{ if(e.target === authModal) closeAuth(); });

// (pasirinktinai) po sėkmingo login – parodyti profilį
function mockLoginSuccess(name='Vartotojas'){
  document.getElementById('userProfile')?.classList.remove('hidden');
  document.getElementById('btnLogin')?.classList.add('hidden');
  closeAuth();
}
// document.getElementById('btnGoogle')?.addEventListener('click', mockLoginSuccess);


  // Viešas API (galėsi kviesti iš kitur)
  window.AUGAM_UI = { openSSE, postOnceJSON, newChat, __client:'simple', __autoInit:AUTO_INIT };
})();

})();
