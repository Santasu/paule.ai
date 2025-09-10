<!-- Clerk (CDN) + inicializacija viename bloke -->
<script
  async
  crossorigin="anonymous"
  data-clerk-publishable-key="pk_live_Y2xlcmsucGF1bGUuYWkk"
  src="https://cdn.jsdelivr.net/npm/@clerk/clerk-js@latest/dist/clerk.browser.js">
</script>
<script>
(function(){
  const $ = (id) => document.getElementById(id);

  function renderFallback(){
    const root = $("clerk-auth");
    if (!root) return;
    root.innerHTML = '<button class="btn ghost" type="button">Prisijungti</button>';
  }

  // Palaukiam kol viskas užsikraus (užtikrina, kad Clerk jau įkelta)
  window.addEventListener("load", async () => {
    const root = $("clerk-auth");
    if (!root) return;

    const clerk = window.Clerk;
    if (!clerk || !clerk.load){ renderFallback(); return; }

    // Paimam publishable key iš <script> data atributo (jei reikia)
    const pkTag = document.querySelector('script[data-clerk-publishable-key]');
    const pk = pkTag && pkTag.dataset ? pkTag.dataset.clerkPublishableKey : undefined;

    try { await clerk.load({ publishableKey: pk }); } catch(_) { /* tyliai */ }

    const rerender = () => {
      root.innerHTML = "";

      if (clerk.user){
        // Prisijungęs — rodome user menu (avataras, sign out ir t.t.)
        const holder = document.createElement("div");
        root.appendChild(holder);
        clerk.mountUserButton(holder, {
          appearance: { elements: { userButtonAvatarBox: "rounded-xl" } }
        });
        return;
      }

      // NEprisijungęs — vienas mygtukas „Prisijungti“
      const btn = document.createElement("button");
      btn.className = "btn ghost";
      btn.type = "button";
      btn.textContent = "Prisijungti";
      btn.onclick = () => clerk.openSignIn({
        afterSignInUrl: "/",
        afterSignUpUrl: "/"
        // Google mygtukas modale atsiras, jei Clerk'e įjungtas SSO → Google.
      });
      root.appendChild(btn);
    };

    rerender();
    clerk.addListener(rerender);
  });
})();
</script>
