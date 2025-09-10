/* =======================================================================
   Paule – Modelių žemėlapis • v1.4.0
   Visi modeliai laikomi SSE-capable (naudojam /api/stream)
   ======================================================================= */
(function () {
  'use strict';

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

  const ICONS_BASE = (window.PAULE_CONFIG && window.PAULE_CONFIG.iconsBase) || '/assets/icon';
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

  // ❗ Nebėra NON_SSE_FRONT – visi laikomi SSE-capable
  function canonicalFrontId(id){
    const s = String(id||'').toLowerCase().trim();
    if (s==='paule' || s==='augam-auto') return 'auto';
    if (FRONT_TO_BACK[s]) return s;
    if (BACK_TO_FRONT[id]) return BACK_TO_FRONT[id];
    return 'auto';
  }
  function getBackId(front){ const f=canonicalFrontId(front); return FRONT_TO_BACK[f]||f||'auto'; }
  function nameOf(id){ return MODEL_NAME[id] || MODEL_NAME[canonicalFrontId(id)] || String(id); }
  function iconOf(id){ return MODEL_ICON[canonicalFrontId(id)] || MODEL_ICON.auto; }

  function normalizeModelsInput(list){
    if (!list) return ['auto'];
    if (typeof list==='string') list = list.split(',').map(s=>s.trim()).filter(Boolean);
    const set = new Set(list.map(canonicalFrontId).filter(Boolean));
    if (!set.size) set.add('auto');
    return Array.from(set);
  }

  // Dabar splitTransports visus meta į stream, JSON grupei – nieko
  function splitTransports(frontList){
    return { stream: normalizeModelsInput(frontList), json: [] };
  }

  function listAll(){
    const seen=new Set(); const fronts=Object.keys(FRONT_TO_BACK); const items=[];
    fronts.forEach(f=>{
      if (seen.has(f)) return; seen.add(f);
      const back=FRONT_TO_BACK[f]||f;
      items.push({ id:f, back, name:nameOf(f), icon:iconOf(f), sse:true });
    });
    items.push({ id:'judge', back:'meta-llama/Llama-4-Scout-17B-16E-Instruct', name:nameOf('judge'), icon:iconOf('judge'), sse:true });
    return items;
  }

  async function ensureCapabilities(){ return true; }

  const API={ FRONT_TO_BACK,BACK_TO_FRONT,MODEL_NAME,MODEL_ICON,
    canonicalFrontId,getBackId,nameOf,iconOf,normalizeModelsInput,splitTransports,listAll,ensureCapabilities
  };
  try{ Object.freeze(API);}catch(_){}
  window.PAULE_MODELS=API;
  window.getBackId=window.getBackId||getBackId;
  window.nameOf=window.nameOf||nameOf;
})();
