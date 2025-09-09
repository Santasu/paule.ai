// /public/assets/js/models.js
(function () {
  'use strict';

  // ---- DEFAULT (fallback) SLUGS, jei serveris dar neatsakė
  const DEFAULT_FRONT_TO_BACK = Object.freeze({
    'auto':'auto','paule':'gpt-4o-mini','augam-auto':'auto',
    'chatgpt':'gpt-4o-mini',
    'claude':'claude-4-sonnet',
    'gemini':'gemini-2.5-flash',
    'grok':'grok-4',
    'deepseek':'deepseek-chat',
    'llama':'meta-llama/Llama-4-Scout-17B-16E-Instruct'
  });

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

  // front → back (dinamiškai perrašysim iš /api/models)
  let FRONT_TO_BACK = { ...DEFAULT_FRONT_TO_BACK };

  const NON_SSE_FRONT = new Set([
    // jei kažkuris tiekėjas neteikia SSE, įrašyk čia jo *front id*;
    // kol kas visi trys (Claude, Gemini 2.5, Grok 4) SSE palaiko.
  ]);

  const lc = s => String(s||'').toLowerCase().trim();

  function rebuildAPI(){
    const BACK_TO_FRONT = Object.freeze(Object.entries(FRONT_TO_BACK).reduce((m,[f,b])=>(m[b]=f,m),{}));

    function canonicalFrontId(id){
      if(!id) return 'auto';
      let s=lc(id);
      if(!FRONT_TO_BACK[s] && BACK_TO_FRONT[id]) s = BACK_TO_FRONT[id];
      if(s==='paule'||s==='augam-auto') s='chatgpt'; // vizualiai "Paule" – bet techn. OpenAI mini
      return s;
    }
    function getBackId(front){ const f=canonicalFrontId(front); return FRONT_TO_BACK[f]||f||'auto'; }
    function nameOf(id){ return MODEL_NAME[id] || MODEL_NAME[canonicalFrontId(id)] || String(id); }
    function iconOf(id){ const f=canonicalFrontId(id); return MODEL_ICON[f] || MODEL_ICON.auto; }
    function isSSECapable(front){ const f=canonicalFrontId(front); return !NON_SSE_FRONT.has(f); }
    function normalizeModelsInput(list){
      if(!list) return ['auto'];
      if(typeof list==='string'){ list=list.split(',').map(s=>s.trim()).filter(Boolean); }
      const set=new Set(list.map(canonicalFrontId).filter(Boolean));
      if(!set.size) set.add('auto'); return Array.from(set);
    }
    function splitTransports(frontList){
      const out={stream:[],json:[]};
      normalizeModelsInput(frontList).forEach(fid=>{
        if(fid==='auto'){ out.stream.push('auto'); return; }
        (isSSECapable(fid)?out.stream:out.json).push(fid);
      });
      return out;
    }
    function listAll(){
      const seen=new Set(); const fronts=Object.keys(FRONT_TO_BACK); const items=[];
      fronts.forEach(f=>{
        if(seen.has(f)) return; seen.add(f);
        const back=FRONT_TO_BACK[f]||f;
        items.push({ id:f, back, name:nameOf(f), icon:iconOf(f), sse:isSSECapable(f) });
      });
      items.push({ id:'judge', back:FRONT_TO_BACK['llama'], name:nameOf('judge'), icon:iconOf('judge'), sse:true });
      return items;
    }

    const API={ FRONT_TO_BACK:Object.freeze({...FRONT_TO_BACK}),
      BACK_TO_FRONT, MODEL_NAME, MODEL_ICON, NON_SSE_FRONT,
      canonicalFrontId, getBackId, nameOf, iconOf, isSSECapable,
      normalizeModelsInput, splitTransports, listAll
    };
    try{ Object.freeze(API);}catch(_){}
    window.PAULE_MODELS = API;
    window.getBackId    = window.getBackId || getBackId;
    window.nameOf       = window.nameOf   || nameOf;
  }

  // Pirmas API – su default’ais
  rebuildAPI();

  // 🔄 Po to – pasikeliam *serverio tiesą* ir perrašom mapping’ą
  (async function syncFromServer(){
    try{
      const r = await fetch('/api/models', { cache:'no-store' });
      const j = await r.json();
      if (j && Array.isArray(j.models)) {
        j.models.forEach(m=>{
          if (m.key && m.id) FRONT_TO_BACK[m.key] = m.id;
        });
        rebuildAPI(); // perrašom jau publikuotą window.PAULE_MODELS
      }
    }catch(_){}
  })();
})();
