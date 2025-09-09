/* ===== Paule - Clerk Popup (vienas failas) =======================
   - Įdėk šį failą į /public/auth/clerk-popup.js
   - HTML'e tik:
       <div id="clerk-auth"></div>
       <script defer src="/auth/clerk-popup.js" data-pk="PK_TAVO_PUBLISHABLE_KEY"></script>
   - Šis failas automatiškai:
       * įterpia CSS
       * įterpia mygtukus (Prisijungti / Atsijungti)
       * atidaro Clerk popup su Google
       * rodo vartotojo vardą
   ================================================================ */

(function () {
  // --- Nustatymai iš <script ... data-pk="pk_..."> ---
  const curScript = document.currentScript;
  const PK = (window.CLERK_PUBLISHABLE_KEY || (curScript && curScript.dataset.pk) || '').trim();
  const TARGET_ID = (curScript && curScript.dataset.target) || 'clerk-auth';
  const REDIRECT = (curScript && curScript.dataset.redirect) || window.location.href;

  // --- Surandam / sukuriam konteinerį ---
  let root = document.getElementById(TARGET_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = TARGET_ID;
    document.body.insertBefore(root, document.body.firstChild);
  }

  // --- Minimalus stilius (įterpiamas automatiškai) ---
  const style = document.createElement('style');
  style.textContent = `
    .c-auth{display:flex;gap:10px;align-items:center;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
    .c-btn{padding:8px 14px;border-radius:12px;border:1px solid #444;background:#111;color:#fff;cursor:pointer}
    .c-btn.ghost{background:transparent;color:#ddd}
    .c-user{display:flex;gap:10px;align-items:center}
    .c-avatar{width:28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:700;background:#222;color:#fff}
    .c-name{font-weight:600;color:#eee}
    .hidden{display:none !important}
  `;
  document.head.appendChild(style);

  // --- Įkeliame pradinį HTML į konteinerį ---
  root.innerHTML = `
    <div class="c-auth">
      <button class="c-btn" data-login>Prisijungti su Google</button>
      <div class="c-user hidden" data-signedin>
        <span class="c-avatar" data-initial>U</span>
        <span class="c-name" data-name>Vartotojas</span>
        <button class="c-btn ghost" data-logout>Atsijungti</button>
      </div>
    </div>
  `;

  const loginBtn = root.querySelector('[data-login]');
  const logoutBtn = root.querySelector('[data-logout]');
  const signedInBox = root.querySelector('[data-signedin]');
  const nameEl = root.querySelector('[data-name]');
  const initialEl = root.querySelector('[data-initial]');

  if (!PK) {
    loginBtn.textContent = '❗️Trūksta Clerk publishable key';
    loginBtn.disabled = true;
    console.warn('Clerk: publishable key nerastas. Perdavimo būdai: data-pk="pk_..." arba window.CLERK_PUBLISHABLE_KEY.');
    return;
  }

  // --- Įkeliame oficialų Clerk JS skriptą (su PK) ---
  function loadClerk() {
    return new Promise((resolve, reject) => {
      if (window.Clerk && window.Clerk.load) return resolve();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
      s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
      s.setAttribute('data-clerk-publishable-key', PK);
      s.onload = resolve;
      s.onerror = () => reject(new Error('Nepavyko įkelti Clerk JS'));
      document.head.appendChild(s);
    });
  }

  // --- Paleidžiam login UI logiką ---
  (async function init() {
    try {
      await loadClerk();
      await window.Clerk.load();

      function render() {
        const on = !!window.Clerk.session?.id;
        loginBtn.classList.toggle('hidden', on);
        signedInBox.classList.toggle('hidden', !on);

        if (on) {
          const u = window.Clerk.user;
          const initial = (u?.firstName?.[0] || u?.username?.[0] || 'U').toUpperCase();
          initialEl.textContent = initial;
          nameEl.textContent = u?.fullName || u?.primaryEmailAddress?.emailAddress || 'Vartotojas';
        }
      }

      window.Clerk.addListener(render);
      render();

      loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        window.Clerk.openSignIn({
          appearance: { layout: { socialButtonsVariant: 'icon' } },
          redirectUrl: REDIRECT
        });
      });

      logoutBtn.addEventListener('click', () => window.Clerk.signOut());

      // Pasirinktinai: helperiai API kvietimams su JWT
      window.getClerkJWT = async (template) =>
        await window.Clerk.session?.getToken(template ? { template } : undefined);

      window.authFetch = async (url, opts = {}, template) => {
        const jwt = await window.getClerkJWT(template);
        const headers = Object.assign({}, opts.headers || {}, jwt ? { Authorization: `Bearer ${jwt}` } : {});
        return fetch(url, Object.assign({}, opts, { headers }));
      };

    } catch (err) {
      console.warn('Clerk widget klaida:', err);
      root.innerHTML = '<div style="color:#f66">⚠️ Nepavyko įkelti prisijungimo.</div>';
    }
  })();
})();
