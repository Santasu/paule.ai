(function () {
  'use strict';

  /* ---------- smulkūs helperiai ---------- */
  const onReady = (fn) =>
    (document.readyState === 'complete' || document.readyState === 'interactive')
      ? setTimeout(fn, 0)
      : document.addEventListener('DOMContentLoaded', fn);

  const getPk = () => {
    try { return (document.currentScript.getAttribute('data-pk') || '').trim(); }
    catch (_) { return ''; }
  };

  const loadClerkLib = () => new Promise((res, rej) => {
    if (window.Clerk && window.Clerk.version) return res();
    const s = document.createElement('script');
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js';
    s.onload = res;
    s.onerror = () => rej(new Error('Nepavyko užkrauti Clerk JS'));
    document.head.appendChild(s);
  });

  /* ---------- paprastas modalas ---------- */
  function openModal() {
    if (document.getElementById('clerk-modal-overlay')) return document.getElementById('clerk-modal-root');

    const css = `
      #clerk-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.38);backdrop-filter:saturate(1.2) blur(2px);z-index:3000;display:flex;align-items:center;justify-content:center;padding:18px}
      #clerk-modal{width:min(420px,92vw);background:var(--bg-primary,#fff);border-radius:16px;box-shadow:0 20px 60px rgba(0,0,0,.25);overflow:hidden}
      #clerk-x{position:absolute;right:10px;top:10px;border:1px solid rgba(0,0,0,.12);background:#fff;border-radius:10px;padding:4px 8px;cursor:pointer}
    `;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

    const ov = document.createElement('div'); ov.id = 'clerk-modal-overlay';
    const box = document.createElement('div'); box.id = 'clerk-modal'; box.role = 'dialog'; box.ariaLabel = 'Prisijungimas';
    const close = document.createElement('button'); close.id='clerk-x'; close.type='button'; close.textContent='✕';
    const root = document.createElement('div'); root.id = 'clerk-modal-root';

    close.addEventListener('click', () => ov.remove());
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });

    box.appendChild(close);
    box.appendChild(root);
    ov.appendChild(box);
    document.body.appendChild(ov);
    return root;
  }

  /* ---------- render funkcijos ---------- */
  function renderSignedOut(clerk, mount) {
    mount.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'btn ghost';
    btn.type = 'button';
    btn.innerHTML = 'Prisijungti';
    btn.addEventListener('click', () => {
      const root = openModal();
      // montuojame Clerk SignIn komponentą į savo modalą
      try {
        clerk.mountSignIn(root, {
          // po prisijungimo/grąžinam į tą patį puslapį
          afterSignInUrl: window.location.href,
          afterSignUpUrl: window.location.href,
          // rodom tik el. paštą + slaptaž., o social – Google (jei įjungta projekte)
          // (social mygtukai atsiranda tik jei Google įjungta Clerk'e)
          appearance: {
            variables: {
              colorPrimary: '#4f46e5',
              colorText: '#111827',
              colorBackground: '#ffffff',
              borderRadius: '14px',
              fontSize: '14px'
            },
            elements: {
              formButtonPrimary: { borderRadius: '12px', fontWeight: 700, padding: '10px 14px' },
              socialButtonsBlockButton: { borderRadius: '12px', fontWeight: 700 },
              footerAction: { fontSize: '13px' },
              headerTitle: { fontWeight: 800 }
            },
            layout: {
              socialButtonsPlacement: 'bottom',   // Google apačioje
              socialButtonsVariant: 'button',     // su tekstu + ikona
              shimmer: false,
              helpPageUrl: null,
            }
          },
          // LT tekstai (minimalūs)
          localization: {
            signIn: {
              start: {
                title: 'Prisijunk',
                subtitle: 'Įvesk el. paštą ir slaptažodį',
                actionText: 'Neturi paskyros?',
                actionLink: 'Registruokis'
              }
            },
            socialButtonsBlockButton: 'Prisijungti su {{provider}}',
            formFieldLabel__emailAddress: 'El. paštas',
            formFieldLabel__password: 'Slaptažodis',
            formButtonPrimary: 'Prisijungti',
          }
        });
      } catch (e) {
        console.error('[Clerk] mountSignIn error, darom redirect:', e);
        clerk.redirectToSignIn({ afterSignInUrl: window.location.href, afterSignUpUrl: window.location.href });
      }
    });
    mount.appendChild(btn);
  }

  function renderSignedIn(clerk, mount) {
    mount.innerHTML = '';
    const holder = document.createElement('div');
    holder.id = 'clerk-user-button';
    mount.appendChild(holder);
    clerk.mountUserButton(holder, {
      appearance: {
        elements: {
          userButtonAvatarBox: { cursor: 'pointer' }
        }
      }
    });
  }

  /* ---------- inic ---------- */
  onReady(async () => {
    const mount = document.getElementById('clerk-auth');
    if (!mount) return;

    let pk = getPk();
    if (!pk) {
      try { pk = (await fetch('/api/clerk/pk').then(r => r.ok ? r.text() : '')).trim(); } catch(_) {}
    }
    if (!pk) { mount.innerHTML = '<span style="color:#c00;font-size:12px">Clerk PK nerastas</span>'; return; }

    try {
      await loadClerkLib();
      const Ctor = window.Clerk;
      const clerk = new Ctor(pk);
      await clerk.load();

      const paint = () => clerk.user ? renderSignedIn(clerk, mount) : renderSignedOut(clerk, mount);
      paint();
      clerk.addListener(paint);
      console.log('[Clerk] init OK');
    } catch (e) {
      console.error('[Clerk] inicializavimo klaida:', e);
      mount.innerHTML = '<span style="color:#c00;font-size:12px">Clerk inicializavimo klaida</span>';
    }
  });
})();

