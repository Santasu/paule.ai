
(() => {
  const byId = (id) => document.getElementById(id);

  function renderFallback() {
    const root = byId('clerk-auth');
    if (!root) return;
    root.innerHTML = '<button class="btn ghost" type="button">Prisijungti</button>';
  }

  window.addEventListener('load', async () => {
    const root = byId('clerk-auth');
    if (!root) return;

    const clerk = window.Clerk;
    if (!clerk || !clerk.load) { renderFallback(); return; }

    // Jei publishable key nepersiima – paimame iš <script> data atributo
    const pkTag = document.querySelector('script[data-clerk-publishable-key]');
    const pk = pkTag?.dataset?.clerkPublishableKey;
    try { await clerk.load({ publishableKey: pk }); } catch { /* tyliai */ }

    const rerender = () => {
      root.innerHTML = '';

      if (clerk.user) {
        // Prisijungęs – rodom user button
        const holder = document.createElement('div');
        root.appendChild(holder);
        clerk.mountUserButton(holder, {
          appearance: { elements: { userButtonAvatarBox: 'rounded-xl' } }
        });
        return;
      }

      // NEprisijungęs – vienas mygtukas „Prisijungti“
      const btn = document.createElement('button');
      btn.className = 'btn ghost';
      btn.type = 'button';
      btn.textContent = 'Prisijungti';
      btn.onclick = () => clerk.openSignIn({
        afterSignInUrl: '/',
        afterSignUpUrl: '/',
        // Google mygtukas atsiras tik jei Google OAuth įjungtas Clerk’e (žr. 4 skyrių)
      });
      root.appendChild(btn);
    };

    rerender();
    clerk.addListener(rerender);
  });
})();
