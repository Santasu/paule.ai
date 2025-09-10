
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

  // JSON only (šie neturi normalaus SSE per tavo backend)
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

