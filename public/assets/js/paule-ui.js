(function(){
  const $ = (sel, root=document)=>root.querySelector(sel);
  const $$ = (sel, root=document)=>Array.from(root.querySelectorAll(sel));

  // MODEL: default 'paule'
  let currentModel = 'paule';

  // SPECIALISTAI
  const SPECIALISTS = {
    doctor:{label:'Daktaras', icon:'/assets/icon/medical-stethoscope.svg'},
    chef:{label:'Šefas', icon:'/assets/icon/chef-knife.svg'},
    marketer:{label:'Marketing', icon:'/assets/icon/marketing-megaphone.svg'},
    sales:{label:'Pardavimai', icon:'/assets/icon/sales-handshake.svg'},
    business:{label:'Verslas', icon:'/assets/icon/business-strategy.svg'},
    finance:{label:'Finansai', icon:'/assets/icon/finance-investment.svg'},
    travel:{label:'Kelionės', icon:'/assets/icon/travel-map.svg'},
    event:{label:'Renginiai', icon:'/assets/icon/event-planning.svg'},
    artist:{label:'Menas', icon:'/assets/icon/art-palette.svg'},
    hr:{label:'HR', icon:'/assets/icon/hr-recruitment.svg'},
    lawyer:{label:'Teisininkas', icon:'/assets/icon/legal-contract.svg'},
    psychologist:{label:'Psichologas', icon:'/assets/icon/psychology-brain.svg'}
  };

  const cards = new Map();

  function init(){
    // Modelių pasirinkimas
    $$('#modelList .model-pill').forEach(p=>{
      p.addEventListener('click', ()=>{
        $$('#modelList .model-pill').forEach(x=>x.classList.remove('active'));
        p.classList.add('active');
        currentModel = p.dataset.model || 'paule';
      });
    });

    // Specialistai kairėje
    $$('#specialistGrid .chip').forEach(chip=>{
      chip.addEventListener('click', ()=>openSpecialist(chip.dataset.spec));
    });

    // Welcome greitieji
    $$('.welcome-btn').forEach(btn=>{
      btn.addEventListener('click', ()=>openSpecialist(btn.dataset.action));
    });

    // Siuntimas
    $('#sendBtn')?.addEventListener('click', onSend);
    $('#messageInput')?.addEventListener('keydown', (e)=>{
      if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); onSend(); }
    });

    // Overlay (jei prireiks)
    $('#closeSpecialistOverlay')?.addEventListener('click', ()=>$('#specialistOverlay').classList.remove('active'));

    // Užpildom overlay parinktis
    renderOverlayOptions();
  }

  function renderOverlayOptions(){
    const box = $('#specialistOptions');
    if(!box) return;
    box.innerHTML = '';
    Object.entries(SPECIALISTS).forEach(([id, info])=>{
      const el = document.createElement('div');
      el.className = 'chip';
      el.innerHTML = `<img src="${info.icon}" style="width:14px;height:14px">${info.label}`;
      el.addEventListener('click', ()=>{
        $('#specialistOverlay').classList.remove('active');
        openSpecialist(id);
      });
      box.appendChild(el);
    });
  }

  function openSpecialist(specId){
    const chatArea = $('#chatArea');
    if(!chatArea) return;

    let card = cards.get(specId);
    if(!card){
      card = createCard(specId);
      chatArea.prepend(card);
      cards.set(specId, card);
      $('#welcome')?.remove();
    }
    card.scrollIntoView({behavior:'smooth',block:'start'});
  }

  function createCard(specId){
    const info = SPECIALISTS[specId] || {label:specId, icon:'/assets/icon/ai.svg'};
    const el = document.createElement('section');
    el.className = 'chat-card';
    el.dataset.spec = specId;
    el.innerHTML = `
      <div class="chat-card__head">
        <div class="chat-card__title">
          <img src="${info.icon}" style="width:18px;height:18px">
          <span>${info.label}</span>
          <span style="opacity:.6;font-size:12px;padding-left:8px">• modelis: <b>${currentModel}</b></span>
        </div>
        <button class="btn btn--close">Uždaryti</button>
      </div>
      <div class="chat-card__body"></div>
    `;
    el.querySelector('.btn--close')?.addEventListener('click', ()=>{
      el.remove();
      cards.delete(specId);
      if(cards.size===0) restoreWelcome();
    });
    return el;
  }

  function restoreWelcome(){
    if($('#welcome')) return;
    const w = document.createElement('div');
    w.id = 'welcome';
    w.className = 'welcome';
    w.innerHTML = `<h1>Kaip galiu padėti šiandien?</h1><p>Pasirinkite AI specialistą kairėje – atsidarys jo kortelė.</p>`;
    $('#chatArea')?.appendChild(w);
  }

  function onSend(){
    const input = $('#messageInput');
    if(!input) return;
    const text = (input.value || '').trim();
    if(!text) return;

    const firstCard = Array.from(cards.values())[0] || null;
    if(!firstCard){
      $('#specialistOverlay')?.classList.add('active'); // paprašom pasirinkti specialistą
      return;
    }

    appendMessage(firstCard, text, 'me');
    input.value = '';

    // DEMO (vėliau pakeisim į /api/router SSE)
    setTimeout(()=>{
      appendMessage(firstCard, `„${text}“ → (demo) atsakymas iš ${currentModel}`, 'bot');
    }, 400);
  }

  function appendMessage(cardEl, text, who='bot'){
    const body = cardEl.querySelector('.chat-card__body');
    const msg = document.createElement('div');
    msg.className = 'msg ' + (who==='me' ? 'me' : '');
    msg.textContent = text;
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
  }

  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
