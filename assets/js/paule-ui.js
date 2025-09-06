/* public/assets/js/paule-ui.js
   Minimalus UI elgesys: naujas pokalbis, specialistų pop-up, žinučių siuntimas,
   modelių perjungimas, tema, mobilus meniu, įrankių stub'ai.
*/
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // DOM
  const chatArea = $("#chatArea");
  const btnNewChat = $("#btnNewChat");
  const messageInput = $("#messageInput");
  const sendBtn = $("#sendBtn");
  const modelList = $("#modelList");
  const sidebar = $("#sidebar");
  const btnMobile = $("#btnMobile");
  const bottomSection = $("#bottomSection");
  const chipTheme = $("#chipTheme");
  const loginBtn = $("#btnLogin");
  const loginModalOverlay = $("#loginModalOverlay");
  const closeLoginModal = $("#closeLoginModal");
  const specialistGrid = $("#specialistGrid");
  const specialistOverlay = $("#specialistOverlay");
  const specialistOptions = $("#specialistOptions");
  const closeSpecialistOverlay = $("#closeSpecialistOverlay");
  const mobileOverlay = $("#mobileOverlay");

  // State
  const state = {
    chats: new Map(),     // id -> {id, title, model, el}
    activeChatId: null,
    activeModel: "paule",
    activeSpecialist: null
  };

  const uid = () => Math.random().toString(36).slice(2, 9);

  // Chat card
  function createChatCard({ title = "Paule", model = state.activeModel, specialist = null } = {}) {
    const id = uid();
    const card = document.createElement("section");
    card.className = "chat-card";
    card.dataset.chatId = id;
    card.innerHTML = `
      <div class="chat-card__head" style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-bottom:1px solid var(--border);background:var(--bg-secondary);border-radius:12px 12px 0 0;">
        <div class="chat-card__title" style="display:flex;align-items:center;gap:10px;font-weight:700;">
          <img src="/assets/icon/ai.svg" alt="" width="18" height="18"/>
          <span class="chat-title">${escapeHtml(title)}</span>
        </div>
        <div class="chat-card__actions" style="display:flex; gap:8px; align-items:center;">
          <span class="model-tag" data-model-badge>${modelLabel(model)}</span>
          <button class="btn" data-action="clear">Išvalyti</button>
          <button class="btn" data-action="close">Uždaryti</button>
        </div>
      </div>
      <div class="chat-card__body" data-chat-body style="padding:12px;display:grid;gap:10px;max-height:50dvh;overflow:auto"></div>
    `;
    chatArea.prepend(card);

    if (specialist) {
      appendMsg({
        chatId: id,
        role: "assistant",
        model,
        html: `<b>${escapeHtml(title)}</b> pasiruošęs. Aprašykite situaciją – padėsiu nuo pirmų žingsnių.`
      });
    }

    const clearBtn = card.querySelector('[data-action="clear"]');
    const closeBtn = card.querySelector('[data-action="close"]');
    on(clearBtn, "click", () => card.querySelector("[data-chat-body]").innerHTML = "");
    on(closeBtn, "click", () => {
      card.remove();
      state.chats.delete(id);
      if (state.activeChatId === id) {
        const first = [...state.chats.keys()][0] || null;
        setActiveChat(first);
      }
    });

    state.chats.set(id, { id, title, model, el: card });
    setActiveChat(id);
    bottomSection.classList.remove("initial-position");
    bottomSection.classList.add("after-message");
    return id;
  }

  function setActiveChat(id) {
    state.activeChatId = id;
    $$(".chat-card", chatArea).forEach((c) => {
      c.style.outline = c.dataset.chatId === id ? "2px solid var(--accent)" : "none";
      c.style.outlineOffset = c.dataset.chatId === id ? "-2px" : "";
    });
  }

  function activeBodyEl() {
    if (!state.activeChatId) return null;
    const chat = state.chats.get(state.activeChatId);
    return chat ? chat.el.querySelector("[data-chat-body]") : null;
  }

  // Messages
  function appendMsg({ chatId, role = "assistant", model = state.activeModel, html = "" }) {
    const chat = state.chats.get(chatId);
    if (!chat) return;

    const body = chat.el.querySelector("[data-chat-body]");
    const wrap = document.createElement("div");
    wrap.className = `message ${role === "user" ? "user" : ""}`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    if (role === "user") avatar.textContent = "JŪS";
    else avatar.innerHTML = `<img src="/assets/icon/ai.svg" alt="AI">`;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.dataset.model = model;
    bubble.innerHTML = `
      <div class="bubble-card">
        <div class="msg-content">${html}</div>
        <div class="msg-meta">
          <span>${role === "user" ? "Vartotojas" : "Asistentas"}</span>
          <span class="model-tag">${modelLabel(model)}</span>
        </div>
      </div>
    `;

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    body.appendChild(wrap);
    body.scrollTop = body.scrollHeight;
  }

  // New chat – SPEC: išvalo, rodo welcome, grąžina bottom į initial
  function startNewChat() {
    chatArea.innerHTML = `
      <div class="welcome" id="welcome">
        <h1>Kaip galiu padėti šiandien?</h1>
        <p>Pasirinkite AI specialistą kairėje – atsidarys jo <b>kortelė</b> ir pokalbis vyks joje. Viršuje galite keisti modelį; pagal nutylėjimą – <b>Paule</b>.</p>
        <div class="welcome-actions">
          <button class="welcome-btn" data-action="doctor"><img src="/assets/icon/medical-heart-pulse.svg" style="width:16px;height:16px"> Sveikatos konsultacija</button>
          <button class="welcome-btn" data-action="chef"><img src="/assets/icon/chef-healthy-bowl.svg" style="width:16px;height:16px"> Kulinarijos patarimai</button>
          <button class="welcome-btn" data-action="business"><img src="/assets/icon/business-finance.svg" style="width:16px;height:16px"> Verslo strategija</button>
        </div>
      </div>
    `;
    state.chats.clear();
    state.activeChatId = null;
    bottomSection.classList.add("initial-position");
    bottomSection.classList.remove("after-message");
    // leist pasirinkti specialistą iš welcome mygtukų
    $$(".welcome-btn", chatArea).forEach(btn => {
      on(btn, "click", () => openSpecialistOverlay(btn.dataset.action));
    });
  }

  // Specialist overlay
  function openSpecialistOverlay(prefSpec = null) {
    specialistOptions.innerHTML = "";
    const list = prefSpec ? [prefSpec] : $$("[data-spec]", specialistGrid).map(el => el.dataset.spec);
    const DEF = {
      doctor: { title: "Daktaras", icon: "🩺", desc: "Sveikatos konsultacijos, bendro pobūdžio patarimai." },
      chef: { title: "Šefas", icon: "👨‍🍳", desc: "Receptai, meniu idėjos, mityba." },
      marketer: { title: "Marketing", icon: "📣", desc: "Skelbimai, įvaizdis, social media." },
      sales: { title: "Pardavimai", icon: "🤝", desc: "Skriptai, CRM, užuominos." },
      business: { title: "Verslas", icon: "📈", desc: "Strategija, kainodara, planas." },
      finance: { title: "Finansai", icon: "💶", desc: "Biudžetas, P/L, KPI." },
      travel: { title: "Kelionės", icon: "🗺️", desc: "Maršrutai, viešbučiai." },
      event: { title: "Renginiai", icon: "🎪", desc: "Planavimas, tiekėjai." },
      artist: { title: "Menas", icon: "🎨", desc: "Idėjos, stiliai." },
      hr: { title: "HR", icon: "🧑‍💼", desc: "Skelbimai, atranka." },
      lawyer: { title: "Teisininkas", icon: "⚖️", desc: "Bendri teisiniai paaiškinimai." },
      psychologist: { title: "Psichologas", icon: "🧠", desc: "Kasdieniai įpročiai, savijauta." }
    };
    list.forEach(key => {
      const it = DEF[key] || { title: key, icon: "✨", desc: "Pagalba jūsų temai." };
      const card = document.createElement("div");
      card.className = "specialist-option";
      card.style.cssText = "border:1px solid var(--border);padding:12px;border-radius:12px;cursor:pointer;display:flex;gap:10px;align-items:center;";
      card.innerHTML = `
        <span class="specialist-option-icon" style="font-size:18px">${it.icon}</span>
        <div style="display:flex;flex-direction:column">
          <div class="specialist-option-title" style="font-weight:700">${it.title}</div>
          <div class="specialist-option-desc" style="color:var(--text-secondary);font-size:13px">${it.desc}</div>
        </div>
      `;
      on(card, "click", () => {
        state.activeSpecialist = key;
        const id = createChatCard({ title: it.title || "Specialistas", model: state.activeModel, specialist: key });
        closeOverlay();
        setActiveChat(id);
        messageInput.focus();
      });
      specialistOptions.appendChild(card);
    });
    specialistOverlay.classList.add("active");
  }
  function closeOverlay(){ specialistOverlay.classList.remove("active"); }

  // Modeliai
  function modelLabel(model) {
    const map = {
      "paule": "Paule",
      "gpt": "ChatGPT",
      "gpt-4o-mini": "ChatGPT",
      "claude": "Claude",
      "claude-4-sonnet": "Claude",
      "gemini": "Gemini",
      "gemini-2.5-flash": "Gemini",
      "grok": "Grok",
      "grok-4": "Grok",
      "deepseek": "DeepSeek",
      "deepseek-chat": "DeepSeek",
      "llama": "Llama",
      "meta-llama/Llama-4-Scout-17B-16E-Instruct": "Llama"
    };
    return map[model] || model;
  }
  function switchModel(next) {
    state.activeModel = next;
    $$(".model-pill", modelList).forEach(p => p.classList.toggle("active", p.dataset.model === next));
    const chat = state.chats.get(state.activeChatId);
    if (chat) {
      chat.model = next;
      const badge = chat.el.querySelector("[data-model-badge]");
      if (badge) badge.textContent = modelLabel(next);
    }
  }

  // Siuntimas
  function sendMessage() {
    const text = (messageInput.value || "").trim();
    if (!text) return;
    if (!state.activeChatId) {
      createChatCard({ title: "Paule", model: state.activeModel });
    }
    appendMsg({
      chatId: state.activeChatId,
      role: "user",
      model: state.activeModel,
      html: escapeHtml(text)
    });
    messageInput.value = "";
    const typingId = showTyping();
    setTimeout(() => {
      hideTyping(typingId);
      appendMsg({
        chatId: state.activeChatId,
        role: "assistant",
        model: state.activeModel,
        html: "Supratau. Papasakokite šiek tiek plačiau – ko tiksliai siekiate?"
      });
    }, 700);
  }
  function showTyping() {
    const body = activeBodyEl();
    if (!body) return null;
    const el = document.createElement("div");
    el.className = "thinking";
    el.dataset.typingId = uid();
    el.innerHTML = `Mąstau <span class="loading-dots"><span></span><span></span><span></span></span>`;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el.dataset.typingId;
  }
  function hideTyping(id) {
    const el = chatArea.querySelector(`[data-typing-id="${id}"]`);
    if (el) el.remove();
  }

  // Tema
  function toggleTheme() {
    const cur = document.documentElement.getAttribute("data-theme");
    const next = cur === "dark" ? null : "dark";
    if (next) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try { localStorage.setItem("theme", next ? "dark" : "light"); } catch {}
  }
  function restoreTheme() {
    try {
      const t = localStorage.getItem("theme");
      if (t === "dark") document.documentElement.setAttribute("data-theme", "dark");
    } catch {}
  }

  // Login modal
  function openLogin(){ loginModalOverlay?.classList.add("active"); }
  function closeLogin(){ loginModalOverlay?.classList.remove("active"); }

  // Mobilus meniu
  function toggleSidebar() {
    const open = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", open);
    mobileOverlay.classList.toggle("active", open);
  }

  // Tools (stub'ai)
  function wireTools() {
    $$(".tools-bar .tool").forEach(t => {
      on(t, "click", () => {
        const tool = t.dataset.tool;
        t.classList.add("active");
        setTimeout(() => t.classList.remove("active"), 400);
        if (!state.activeChatId) createChatCard({ title: "Paule", model: state.activeModel });

        const pretty = {
          mindmap: "🧭 Mindmap (stub)",
          photo: "📷 Foto (stub)",
          research: "🔎 Tyrinėti (stub)",
          think: "🧠 Mąstyti (stub)",
          file: "📁 Failas (stub)",
          song: "🎵 Daina (stub)"
        }[tool] || "🔧 Įrankis";

        appendMsg({
          chatId: state.activeChatId,
          role: "assistant",
          model: state.activeModel,
          html: `${pretty}: UI paruoštas, backend prijungsim vėliau.`
        });
      });
    });
  }

  // Utils
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  // Events
  on(btnNewChat, "click", startNewChat);
  on(closeSpecialistOverlay, "click", closeOverlay);

  on(sendBtn, "click", sendMessage);
  on(messageInput, "keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  on(modelList, "click", (e) => {
    const pill = e.target.closest(".model-pill");
    if (!pill) return;
    switchModel(pill.dataset.model);
  });

  on(btnMobile, "click", toggleSidebar);
  on(mobileOverlay, "click", toggleSidebar);
  on(chipTheme, "click", toggleTheme);

  on(loginBtn, "click", openLogin);
  on(closeLoginModal, "click", closeLogin);
  on(loginModalOverlay, "click", (e) => { if (e.target === loginModalOverlay) closeLogin(); });

  // Init
  function init() {
    restoreTheme();
    // Specialist chips -> overlay
    $$("#specialistGrid .chip").forEach(ch => {
      on(ch, "click", () => openSpecialistOverlay(ch.dataset.spec));
    });
    // Welcome quick actions
    $$(".welcome-btn").forEach(btn => on(btn, "click", () => openSpecialistOverlay(btn.dataset.action)));
    wireTools();
    switchModel("paule");
  }
  document.addEventListener("DOMContentLoaded", init);

  // Debug helper (optional)
  window.startNewChat = startNewChat;
})();
