(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      setTimeout(fn, 0);
    } else {
      document.addEventListener('DOMContentLoaded', fn);
    }
  }

  function getPk() {
    try {
      const s = document.currentScript;
      return (s && (s.getAttribute('data-pk') || s.dataset.pk) || '').trim();
    } catch (_) { return ''; }
  }

  function loadClerkLibrary() {
    return new Promise((resolve, reject) => {
      if (window.Clerk && window.Clerk.version) return resolve();
      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Nepavyko užkrauti Clerk JS'));
      document.head.appendChild(s);
    });
  }

  function renderSignedOut(clerk, mount) {
    mount.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn ghost';
    btn.type = 'button';
    btn.textContent = 'Prisijungti';
    btn.addEventListener('click', () => {
      let triedModal = false;
      try {
        clerk.openSignIn({
          afterSignInUrl: window.location.href,
          afterSignUpUrl: window.location.href
        });
        triedModal = true;
      } catch (e) {
        console.error('[Clerk] openSignIn error:', e);
      }
      // Fallback: jei modalas neatsidarė – redirect į Clerk puslapį
      setTimeout(() => {
        const hasModal = document.querySelector('[data-clerk-modal], .cl-component');
        if (!hasModal && triedModal) {
          clerk.redirectToSignIn({
            afterSignInUrl: window.location.href,
            afterSignUpUrl: window.location.href
          });
        }
      }, 500);
    });
    mount.appendChild(btn);
  }

  function renderSignedIn(clerk, mount) {
    mount.innerHTML = '';
    const holder = document.createElement('div');
    holder.id = 'clerk-user-button';
    mount.appendChild(holder);
    clerk.mountUserButton(holder, {
      appearance: { elements: { userButtonAvatarBox: { cursor: 'pointer' } } }
    });
  }

  ready(async () => {
    const mount = document.getElementById('clerk-auth');
    if (!mount) return;

    // 1) Publishable Key – pirmiausia iš <script data-pk>, jei neranda – bandome iš /api/clerk/pk
    let pk = getPk();
    if (!pk) {
      try {
        pk = (await fetch('/api/clerk/pk').then(r => r.ok ? r.text() : '')).trim();
      } catch (_) { /* tyliai */ }
    }
    if (!pk) {
      mount.innerHTML = '<span style="color:#c00;font-size:12px">Clerk PK nerastas</span>';
      return;
    }

    try {
      await loadClerkLibrary();

      // Svarbu: kuriame NAUJĄ egzempliorių ir tik tada .load()
      const ClerkCtor = window.Clerk;
      const clerk = new ClerkCtor(pk);
      await clerk.load();

      const paint = () => {
        if (clerk.user) renderSignedIn(clerk, mount);
        else renderSignedOut(clerk, mount);
      };

      paint();
      // atnaujina UI po sign-in / sign-out
      clerk.addListener(paint);
      console.log('[Clerk] init OK');
    } catch (e) {
      console.error('[Clerk] inicializavimo klaida:', e);
      mount.innerHTML = '<span style="color:#c00;font-size:12px">Clerk inicializavimo klaida</span>';
    }
  });
})();
