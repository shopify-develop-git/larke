/*
  Footer cookie-link dedupe.

  The legal row already renders ONE cookie link server-side (the Cookie Preferences page, marked
  data-footer-cookie-link). For visitors in consent regions (UK/EU) a second "Cookie preferences"
  link is injected into the footer in the browser after load (owner, 2026-10-04: shows twice on
  the client's screen, once on ours). Liquid's dedupe register cannot see it — it does not exist
  at render time — so this removes any footer link/button reading "cookie preferences" that is
  not the theme's own. Watches for late injection, then stops after 15s.
*/
(() => {
  const footer = document.querySelector('.site-footer');
  if (!footer || !footer.querySelector('[data-footer-cookie-link]')) return;

  const isCookieLabel = (el) => /^cookie\s+(preferences|settings|policy)$/i.test(el.textContent.trim());

  const dedupe = () => {
    footer.querySelectorAll('a, button').forEach((el) => {
      if (el.hasAttribute('data-footer-cookie-link') || !isCookieLabel(el)) return;
      const item = el.closest('li');
      (item && footer.contains(item) ? item : el).remove();
    });
  };

  dedupe();
  const observer = new MutationObserver(dedupe);
  observer.observe(footer, { childList: true, subtree: true });
  setTimeout(() => observer.disconnect(), 15000);
})();
