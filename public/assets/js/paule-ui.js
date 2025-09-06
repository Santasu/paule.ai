/* public/assets/js/paule-ui.js
   Minimalus, tvarkingas UI elgesys: naujas pokalbis, specialistų pop-up,
   žinučių siuntimas į aktyvią kortelę, modelių perjungimas, tema, mobilus meniu.
*/

(() => {
  // --------
  // Helpers
  // --------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);
  const setAttr = (el, k, v) => el && el.setAttribute(k, v);

  // -------------
  // DOM nuorodos
  // -------------
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

  // -----------------
  // Paprasta būsena
  // -----------------
  const state = {
    chats: new Map(),     // id -> {id, title, model, el}
    activeChatId: null,
    activeModel: "paule",
    activeSpecialist: null
  };

  const uid = () => Math.random().toString(36).slice(2, 9);

  // -----------------------------
  // Kortelės (chat) kūrimas
  // -----------------------------
  function createChatCard({ title = "Paule", model = state.activeModel, specialist = null } = {}) {
    const id = uid();
    const card = document.createElement("section");
    card.className = "chat-card";
    card.dataset.chatId = id;
    card.innerHTML = `
      <div class="chat-card__head">
        <div class="chat-card__title">
          <img src="/assets/icon/ai.svg" alt="" width="18" height="18"/>
          <span class="chat-title">${escapeHtml(title)}</span>
        </div>
        <div class="chat-card__actions" style="display:flex; gap:8px; align-items:center;">
          <span class="model-tag" data-model-badge>${modelLabel(model)}</span>
          <button class="btn" data-action="clear">Išvalyti</button>
          <button class="btn" data-action="close">Uždaryti</button>
        </div>
      </div>
      <div class="chat-card__body" data-chat-body></div>
    `;
    chatArea.prepend(card);

    // įdėti "welcome" žinutę, jei specialistas pasirinktas
    if (specialist) {
      appendMsg({
        chatId: id,
        role: "assistant",
        model,
        html: `<b>${escapeHtml(title)}</b> pasiruošęs. Aprašykite situaciją – padėsiu nuo pirmų žingsnių.`
      });
    }

    // įvykių jungimai
    const clearBtn = card.querySelector('[data-action="clear"]');
    const closeBtn = card.querySelector('[data-action="close"]');
    on(clearBtn, "click", () => {
      const body = card.querySelector("[data-chat-body]");
      body.innerHTML = "";
    });
    on(closeBtn, "click", () => {
      card.remove();
      state.chats.delete(id);
      if (state.activeChatId === id) {
        // perjungti į kitą, jei yra
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
    // vizualiai paryškinti aktyvią kortelę (nebūtina – švelnus akcentas)
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

  // -------------------------
  // Žinutės pridėjimas
  // -------------------------
  function appendMsg({ chatId, role = "assistant", model = state.activeModel, html = "" }) {
    const chat = state.chats.get(chatId);
    if (!chat) return;

    const body = chat.el.querySelector("[data-chat-body]");
    const wrap = document.createElement("div");
    wrap.className = `message ${role === "user" ? "user" : ""}`;

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    if (role === "user") {
      avatar.textContent = "JŪS";
    } else {
      avatar.innerHTML = `<img src="/assets/icon/ai.svg" alt="AI">`;
    }

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
    // autoscroll
    body.scrollTop = body.scrollHeight;
  }

  // --------------------------------------------------
  // „Naujas pokalbis“ – siūlome pasirinkti specialistą
  // --------------------------------------------------
  function openSpecialistOverlay(prefSpec = null) {
    specialistOptions.innerHTML = "";
    const list = prefSpec ? [prefSpec] : $$("[data-spec]", specialistGrid).map(el => el.dataset.spec);

    const DEF = {
      doctor: { title: "Daktaras", icon: "🩺", desc: "Sveikatos konsultacijos, bendro pobūdžio patarimai." },
      chef: { title: "Šefas", icon: "👨‍🍳", desc: "Receptai, meniu idėjos, subalansuota mityba." },
      marketer: { title: "Marketing", icon: "📣", desc: "Skelbimai, įvaizdis, social media planas." },
      sales: { title: "Pardavimai", icon: "🤝", desc: "Pardavimo skambučiai, skriptai, CRM užuominos." },
      business: { title: "Verslas", icon: "📈", desc: "Strategija, kainodara, veiklos planas." },
      finance: { title: "Finansai", icon: "💶", desc: "Biudžetas, P/L, prognozės, KPI." },
      travel: { title: "Kelionės", icon: "🗺️", desc: "Maršrutai, viešbučiai, biudžetai." },
      event: { title: "Renginiai", icon: "🎪", desc: "Planavimas, tiekėjai, biudžetavimas." },
      artist: { title: "Menas", icon: "🎨", desc: "Idėjos, stiliai, aprašai." },
      hr: { title: "HR", icon: "🧑‍💼", desc: "Skelbimai, atranka, vertinimai." },
      lawyer: { title: "Teisininkas", icon: "⚖️", desc: "Bendro pobūdžio teisiniai paaiškinimai." },
      psychologist: { title: "Psichologas", icon: "🧠", desc: "Kasdieniai įpročiai, savijauta, tikslai." }
    };

    list.forEach(key => {
      const it = DEF[key] || { title: key, icon: "✨", desc: "Pagalba jūsų temai." };
      const card = document.createElement("div");
      card.className = "specialist-option";
      card.innerHTML = `
        <span class="specialist-option-icon">${it.icon}</span>
        <div class="specialist-option-title">${it.title}</div>
        <div class="specialist-option-desc">${it.desc}</div>
      `;
      on(card, "click", () => {
        state.activeSpecialist = key;
        const title = it.title || "Specialistas";
        const id = createChatCard({ title, model: state.activeModel, specialist: key });
        closeOverlay();
        setActiveChat(id);
        messageInput.focus();
      });
      specialistOptions.appendChild(card);
    });

    specialistOverlay.classList.add("active");
  }

  function closeOverlay() {
    specialistOverlay.classList.remove("active");
  }

  // -------------------------
  // Modelių perjungimas
  // -------------------------
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
    // pažymėti pill
    $$(".model-pill", modelList).forEach(p => {
      p.classList.toggle("active", p.dataset.model === next);
    });
    // atnaujinti aktyvios kortelės model badge
    const chat = state.chats.get(state.activeChatId);
    if (chat) {
      chat.model = next;
      const badge = chat.el.querySelector("[data-model-badge]");
      if (badge) badge.textContent = modelLabel(next);
    }
  }

  // -------------------------
  // Siuntimas / Enter klavišas
  // -------------------------
  function sendMessage() {
    const text = (messageInput.value || "").trim();
    if (!text) return;
    if (!state.activeChatId) {
      // jei nėra pokalbio – sukuriam standartinį
      createChatCard({ title: "Paule", model: state.activeModel });
    }
    appendMsg({
      chatId: state.activeChatId,
      role: "user",
      model: state.activeModel,
      html: escapeHtml(text)
    });
    messageInput.value = "";
    // „Įvedamas atsakymas“ indikatorius
    const typingId = showTyping();
    // imituojam trumpą AI atsakymą (kol nėra backendo)
    setTimeout(() => {
      hideTyping(typingId);
      appendMsg({
        chatId: state.activeChatId,
        role: "assistant",
        model: state.activeModel,
        html: "Supratau. Papasakokite šiek tiek plačiau – ko tiksliai siekiate?"
      });
    }, 600);
  }

  function showTyping() {
    const body = activeBodyEl();
    if (!body) return null;
    const el = document.createElement("div");
    el.className = "thinking";
    el.dataset.typingId = uid();
    el.innerHTML = `
      Mąstau <span class="loading-dots"><span></span><span></span><span></span></span>
    `;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el.dataset.typingId;
  }
  function hideTyping(id) {
    if (!id) return;
    const el = chatArea.querySelector(`[data-typing-id="${id}"]`);
    if (el) el.remove();
  }

  // -------------------------
  // Tema (šviesi/tamsi)
  // -------------------------
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

  // -------------------------
  // Login modal
  // -------------------------
  function openLogin() {
    if (!loginModalOverlay) return;
    loginModalOverlay.classList.add("active");
  }
  function closeLogin() {
    if (!loginModalOverlay) return;
    loginModalOverlay.classList.remove("active");
  }

  // -------------------------
  // Mobilus meniu (sidebar)
  // -------------------------
  function toggleSidebar() {
    sidebar && sidebar.classList.toggle("open");
  }

  // -------------------------
  // Specialistų chip paspaudimai
  // -------------------------
  function wireSpecialistChips() {
    $$("#specialistGrid .chip").forEach(ch => {
      on(ch, "click", () => {
        const key = ch.dataset.spec;
        openSpecialistOverlay(key);
      });
    });
  }

  // --------------
  // Įvykių jungimas
  // --------------
  on(btnNewChat, "click", () => openSpecialistOverlay());
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
  on(chipTheme, "click", toggleTheme);

  on(loginBtn, "click", openLogin);
  on(closeLoginModal, "click", closeLogin);
  on(loginModalOverlay, "click", (e) => {
    if (e.target === loginModalOverlay) closeLogin();
  });

  // ---------------
  // Utils
  // ---------------
  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[m]));
  }

  // ---------------
  // Init
  // ---------------
  function init() {
    restoreTheme();
    wireSpecialistChips();

    // jei puslapis tuščias – paliekam welcome; vartotojas spaus „Naujas pokalbis“ arba pasirinks specialistą
    // pasirenkame numatytą modelį „paule“
    switchModel("paule");
  }

  document.addEventListener("DOMContentLoaded", init);
})();
