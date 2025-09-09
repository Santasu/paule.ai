(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(fn, 0);
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  async function loadClerk(pk) {
    if (!pk) throw new Error('Publishable key is missing');
    if (window.Clerk && window.Clerk.loaded) return window.Clerk;

    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load Clerk JS'));
      document.head.appendChild(s);
    });

    await window.Clerk.load({ publishableKey: pk });
    return window.Clerk;
  }

  function getPk() {
    try {
      const cur = document.currentScript;
      const pk = (cur && (cur.getAttribute('data-pk') || cur.dataset.pk)) || '';
      return pk.trim();
    } catch (_) { return ''; }
  }

  function renderSignedOut(Clerk, mount) {
    mount.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn ghost';
    btn.type = 'button';
    btn.textContent = 'Prisijungti';
    btn.addEventListener('click', () => {
      Clerk.openSignIn({
        afterSignInUrl: window.location.href,
        afterSignUpUrl: window.location.href
      });
    });
    mount.appendChild(btn);
  }

  function renderSignedIn(Clerk, mount) {
    mount.innerHTML = '';
    const holder = document.createElement('div');
    holder.id = 'clerk-user-button';
    mount.appendChild(holder);
    Clerk.mountUserButton(holder, { appearance: { elements: { userButtonAvatarBox: { cursor: 'pointer' } } } });
  }

  ready(async () => {
    const mount = document.getElementById('clerk-auth');
    if (!mount) return;

    const pk = getPk();
    // jei kažkada norėtum iš API – bandom atsargiai
    const finalPk = pk || (await fetch('/api/clerk/pk').then(r => r.ok ? r.text() : '').catch(() => '')).trim();

    if (!finalPk) {
      mount.innerHTML = '<span style="color:#c00;font-size:12px">Clerk PK nerastas</span>';
      return;
    }

    try {
      const Clerk = await loadClerk(finalPk);

      const paint = () => {
        if (Clerk.user) renderSignedIn(Clerk, mount);
        else renderSignedOut(Clerk, mount);
      };

      paint();
      Clerk.addListener(paint); // atnaujina po prisijungimo/atsijungimo
    } catch (e) {
      console.error('[Clerk]', e);
      mount.innerHTML = '<span style="color:#c00;font-size:12px">Clerk inicializavimo klaida</span>';
    }
  });
})();
