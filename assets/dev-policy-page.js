/* dev-policy-page.js

   One job: reveal the "Manage cookie preferences" button on the Cookie Preferences page and
   point it at Shopify's own consent panel.

   Shopify's cookie banner is a STORE-level feature (Settings > Customer privacy), not theme code —
   grep the theme for `privacyBanner` and this file is the only hit. When it is enabled, Shopify
   injects the banner and publishes:

     window.privacyBanner.showPreferences()   <- reopens the choice panel

   Measured on the store 2026-08-04: window.privacyBanner exists with { loadBanner, showBanner,
   showPreferences }. Note that Shopify.customerPrivacy is a DIFFERENT, older API and is undefined
   here — don't reach for it, it will always fail.

   Why the button starts `hidden` in the markup and is revealed from here, rather than rendering
   visible and failing on click: the banner can be switched off in admin at any time without a
   theme deploy, and this page is the only place a visitor can withdraw consent. A visible button
   that silently does nothing is worse than no button — it looks like the site accepted a refusal
   it never received. So the DOM's default is "no control", and JS upgrades it only after it has
   actually seen the function.

   The wait loop exists because the banner script is third-party and async: on a cold load
   privacyBanner is routinely absent at DOMContentLoaded and appears a few hundred ms later. It
   gives up after ~10s and leaves the button hidden. */

(() => {
  const WRAP_SEL = '[data-consent-preferences]';
  const POLL_MS = 250;
  const POLL_LIMIT = 40; /* ~10s */

  const getApi = () => {
    const b = window.privacyBanner;
    return b && typeof b.showPreferences === 'function' ? b : null;
  };

  const reveal = (wrap) => {
    if (wrap.dataset.consentReady === 'true') return;

    const btn = wrap.querySelector('.dev-btn');
    if (!btn) return;

    wrap.dataset.consentReady = 'true';
    wrap.hidden = false;

    btn.addEventListener('click', (event) => {
      /* The snippet renders a <button> (no `link` passed), so there is nothing to prevent —
         but the label is merchant-editable and a future edit could turn it into a link. */
      event.preventDefault();

      const api = getApi();
      if (api) api.showPreferences();
    });
  };

  const init = () => {
    const wraps = document.querySelectorAll(WRAP_SEL);
    if (!wraps.length) return;

    let tries = 0;

    const tick = () => {
      if (getApi()) {
        wraps.forEach(reveal);
        return;
      }
      tries += 1;
      if (tries > POLL_LIMIT) return;
      setTimeout(tick, POLL_MS);
    };

    tick();
  };

  /* `defer` normally means DOMContentLoaded has not fired yet — but the theme editor and the dev
     server both re-inject a section's scripts after load, when it has. Handle both. */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
