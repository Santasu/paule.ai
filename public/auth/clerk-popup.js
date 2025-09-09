/* Paule × Clerk: vieno failo popup widgetas */
(function () {
  const ANCHOR_ID = 'clerk-auth';

  function getAnchor() {
    return document.getElementById(ANCHOR_ID) || (function () {
      const d = document.createElement('div');
      d.id = ANCHOR_ID;
      (document.querySelector('.top-actions') || document.body).appendChild(d);
      return d;
    })();
  }

  async function getPK() {
    // 1) iš <script data-pk="...">
    try {
      const s = document.currentScript || document.querySelector('script[src$="/auth/clerk-popup.js"]');
      const pk = s?.dataset?.pk?.trim();
      if (pk) return pk;
    } catch (_) {}
    // 2) iš window (jei kada nors įterpsi ranka)
    if (window.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) return window.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
    // 3) iš Vercel env per API (be rakto HTML’e)
    try {
      const r = await fetch('/api/clerk/pk', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (j?.pk) return j.pk;
      }
    } catch (_) {}
    return null;
  }

  function showMissingPK() {
    const box = getAnchor();
    box.innerHTML = '<span style="font-size:12px;opacity:.7">❗️Trūksta Clerk publishable key</span>';
  }

  function loadClerk(pk) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.async = true;
      s.crossOrigin = 'anonymous';
      s.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
      s.setAttribute('data-clerk-publishable-key', pk);
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function renderLogin() {
    const box = getAnchor();
    box.innerHTML = `
      <button class="btn ghost" id="btnLogin" type="button">
        <img class="ui-icon" src="/assets/icon/google.svg" alt=""> Prisijungti
      </button>`;
    box.querySelector('#btnLogin').addEventListener('click', () => {
      window.Clerk.openSignIn({
        redirectUrl: window.location.href,
        appearance: {
          elements: { card: { borderRadius: '14px' } },
          layout:   { socialButtonsVariant: 'icon' }
        }
      });
    });
  }

  function renderUser() {
    const box = getAnchor();
    box.innerHTML = `<div id="clerkUserButton"></div>`;
    window.Clerk.mountUserButton('#clerkUserButton', {
      afterSignOutUrl: window.location.href
    });
  }

  (async () => {
    try {
      const pk = await getPK();
      if (!pk) return showMissingPK();
      await loadClerk(pk);
      await window.Clerk.load();
      const update = () => (window.Clerk.user ? renderUser() : renderLogin());
      window.Clerk.addListener(update);
      update();
    } catch (e) {
      console.warn('Clerk widget error:', e);
      showMissingPK();
    }
  })();
})();
