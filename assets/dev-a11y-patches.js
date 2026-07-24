/* dev-a11y-patches.js

   Two small accessibility patches for markup this theme does not author, loaded
   globally from layout/theme.liquid (same pattern as dev-button.css).

   1. `video_tag` renders a fallback <img> inside every <video> with no alt
      attribute — Lighthouse: "Image elements do not have [alt] attributes".
      The image is the poster frame over again, purely presentational, so the
      correct value is the empty alt that marks an image decorative.

   2. Shopify's own runtime injects utility iframes with no title — the
      web-pixels sandbox and the dynamic checkout buttons (PayPal, Google Pay).
      Lighthouse: "<frame> or <iframe> elements do not have a title". They are
      titled from their hostname so the label is at least honest; the payment
      frames arrive well after load, hence the observer rather than a one-shot.

   Wrapped in an IIFE — every asset here is a classic script sharing one global
   scope. Nothing may leak.
*/
(function () {
  function patch() {
    document.querySelectorAll('video img:not([alt])').forEach(function (img) {
      img.setAttribute('alt', '');
    });

    document.querySelectorAll('iframe:not([title])').forEach(function (frame) {
      var host = '';
      try {
        host = new URL(frame.src, location.href).hostname;
      } catch (e) {
        /* srcless or about:blank frame — the generic label below covers it */
      }
      var title = 'Embedded content';
      if (host && host !== location.hostname) title += ' (' + host + ')';
      frame.setAttribute('title', title);
    });
  }

  function start() {
    patch();
    new MutationObserver(patch).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
