/* =======================================================================
   Paule – Models helper (frontend) • v1.3.0
   - Žemėlapiai (front->back)
   - Pavadinimai ir ikonėlės
   - Auto-detekcija: kurie modeliai palaiko SSE (per /api/models)
   - API: getBackId, nameOf, iconOf, splitTransports, ensureCapabilities
   ======================================================================= */
(function () {
  'use strict';

  const CFG = (window.PAULE_CONFIG||{});
  const ICONS_BASE = CFG.iconsBase || '/assets/icon';
  const MODELS_EP = (CFG.routes && CFG.routes.models) || (CFG.restBase||'/api') + '/models';

  // ---- Žemėlapiai (front->back) ----
  const FRONT_TO_BACK = Object.freeze({
    auto:'auto', paule:'auto', 'augam-auto':'auto',
    chatgpt:'gpt-4o-mini',
    claude:'claude-4-sonnet',
    gemini:'gemini-2.5-flash',
    grok:'grok-4',
    deepseek:'deepseek-chat',
    llama:'meta-llama/Llama-4-Scout-17B-16E-Instruct',
  });

  // Atvirkštinis lookup
  const BACK_TO_FRONT = Object.freeze(Object.entries(FRONT_TO_BACK).reduce((m,[f,b]) => (m[b]=f,m), {}));

  // Draugiški vardai
  const MODEL_NAME = Object.freeze({
    auto:'Paule', paule:'Paule','augam-auto':'Paule',
    chatgpt:'ChatGPT','gpt-4o-mini':'ChatGPT',
    claude:'Claude','claude-4-sonnet':'Claude',
    gemini:'Gemini','gemini-2.5-flash':'Gemini',
    grok:'Grok','grok-4':'Grok',
    deepseek:'DeepSeek','deepseek-chat':'DeepSeek',
    llama:'Llama','meta-llama/Llama-4-Scout-17B-16E-Instruct':'Llama',
    judge:'Teisėjas'
  });

  // Ikonos
  const MODEL_ICON = Object.freeze({
    auto:`${ICONS_BASE}/ai.svg`,
    paule:`${ICONS_BASE}/ai.svg`,
    chatgpt:`${ICONS_BASE}/chatgpt.svg`,
    claude:`${ICONS_BASE}/claude-seeklogo.svg`,
    gemini:`${ICONS_BASE}/gemini.svg`,
    grok:`${ICONS_BASE}/xAI.svg`,
    deepseek:`${ICONS_BASE}/deepseek.svg`,
    llama:`${ICONS_BASE}/llama.svg`,
    judge:`${ICONS_BASE}/legal-contract.svg`,
  });

  // Pagal nutylėjimą laikysim, kad SSE nėra (išskyrus llama / deepseek).
  // Serveryje /api/models gali tai perrašyti.
  let CAP = {
    sseFront: new Set(['llama','deepseek']), // numatytai SSE
    filled: false,
    ts: 0
  };

  const lc = s => String(s||'').toLowerCase().trim();

  function canonicalFrontId(id){
    if (!id) return 'auto';
    let s = lc(id);
    if (!FRONT_TO_BACK[s] && BACK_TO_FRONT[id]) s = BACK_TO_FRONT[id];
    if (s==='paule' || s==='augam-auto') s='auto';
    return s;
  }

  function getBackId(front){
    const f = canonicalFrontId(front);
    return FRONT_TO_BACK[f] || f || 'auto';
  }

  function nameOf(id){
    return MODEL_NAME[id] || MODEL_NAME[canonicalFrontId(id)] || String(id);
  }

  function iconOf(id){
    const f = canonicalFrontId(id);
    return MODEL_ICON[f] || MODEL_ICON.auto;
  }

  function normalizeModelsInput(list){
    if (!list) return ['auto'];
    if (typeof list === 'string') list = list.split(',').map(s=>s.trim()).filter(Boolean);
    const set = new Set(list.map(canonicalFrontId).filter(Boolean));
    if (set.size===0) set.add('auto');
    return Array.from(set);
  }

  function isSSECapable(front){
    const f = canonicalFrontId(front);
    return CAP.sseFront.has(f);
  }

  function splitTransports(frontList){
    const out = { stream:[], json:[] };
    normalizeModelsInput(frontList).forEach(fid=>{
      if (fid==='auto'){ out.stream.push('auto'); return; }
      (isSSECapable(fid) ? out.stream : out.json).push(fid);
    });
    return out;
  }

  function listAll(){
    const seen = new Set();
    const items = [];
    Object.keys(FRONT_TO_BACK).forEach(f=>{
      if (seen.has(f)) return; seen.add(f);
      const back = FRONT_TO_BACK[f] || f;
      items.push({ id:f, back, name:nameOf(f), icon:iconOf(f), sse:isSSECapable(f) });
    });
    items.push({ id:'judge', back:'meta-llama/Llama-4-Scout-17B-16E-Instruct', name:nameOf('judge'), icon:iconOf('judge'), sse:true });
    return items;
  }

  // ---- Auto-detekcija (per /api/models) + cache 24h ----
  async function ensureCapabilities(){
    try{
      const key='paule.capabilities.v1';
      const cached = JSON.parse(localStorage.getItem(key)||'null');
      const now=Date.now();
      if (cached && cached.ts && (now - cached.ts) < 24*3600*1000){
        CAP = { sseFront:new Set(cached.sseFront||[]), ts:cached.ts, filled:true };
        return CAP;
      }
      const res = await fetch(MODELS_EP, { method:'GET', credentials:'omit' });
      if (!res.ok) throw new Error('HTTP '+res.status);
      const json = await res.json();
      const sseFront = new Set();
      (json.items||[]).forEach(it=>{ if (it.sse) sseFront.add(canonicalFrontId(it.id)); });
      // Jei serveris nepateikė – laikom defaultus
      if (sseFront.size===0) ['llama','deepseek'].forEach(m=>sseFront.add(m));
      CAP = { sseFront, ts:now, filled:true };
      localStorage.setItem(key, JSON.stringify({ sseFront:[...sseFront], ts:now }));
      return CAP;
    }catch(_){
      CAP.filled = true;
      return CAP;
    }
  }

  // ---- Exportas ----
  const API = {
    FRONT_TO_BACK, BACK_TO_FRONT, MODEL_NAME, MODEL_ICON,
    canonicalFrontId, getBackId, nameOf, iconOf,
    normalizeModelsInput, isSSECapable, splitTransports, listAll, ensureCapabilities
  };
  try{ Object.freeze(API); }catch(_){}
  window.PAULE_MODELS = API;

  // Suderinamumas
  window.getBackId = window.getBackId || getBackId;
  window.nameOf    = window.nameOf || nameOf;
})();

