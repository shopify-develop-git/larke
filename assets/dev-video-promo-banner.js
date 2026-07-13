/* dev-video-promo-banner.js

   Wrapped in an IIFE — NOT optional on Shopify.

   Shopify serves every section's JS as a CLASSIC script, so all top-level `const`,
   `let` and `function` declarations land in ONE shared global scope. Four sections
   here independently declared `function init()`; function declarations overwrite
   each other, so the LAST script to load silently replaced everyone else's init —
   the header ended up calling a drawer's init and its buttons did nothing at all.
   Both drawers also declared `const ROOT_SELECTOR`, which is a hard SyntaxError
   and stopped cart-drawer.js from running entirely.

   Nothing may leak to the global scope. Keep this wrapper.
*/
(function () {
  /* dev-video-promo-banner.js
     Interactivity: modal (video playback) — Brief pattern (a).
     The background is a static poster; the play button opens the video in a lightbox. */

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.video-promo-banner').forEach((section) => init(section));
  });

  // The theme editor re-renders a section without a fresh DOMContentLoaded.
  document.addEventListener('shopify:section:load', (event) => {
    event.target.querySelectorAll('.video-promo-banner').forEach((section) => init(section));
  });

  function init(section) {
    if (section.dataset.videoPromoInit === 'true') return;

    const trigger = section.querySelector('[data-video-open]');
    const modal = section.querySelector('[data-video-modal]');
    if (!trigger || !modal) return;

    section.dataset.videoPromoInit = 'true';

    const closeButton = modal.querySelector('[data-video-close]');
    const video = modal.querySelector('video');
    const iframe = modal.querySelector('iframe');
    const embedSrc = iframe ? iframe.getAttribute('data-src') : null;

    function open() {
      modal.hidden = false;
      trigger.setAttribute('aria-expanded', 'true');

      if (iframe && embedSrc) iframe.setAttribute('src', embedSrc);
      if (video) {
        const played = video.play();
        if (played && typeof played.catch === 'function') played.catch(() => {});
      }

      if (closeButton) closeButton.focus();
      document.addEventListener('keydown', onKeydown);
    }

    function close() {
      modal.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');

      // Stop playback: blanking the iframe is the only reliable way to kill an embed.
      if (iframe) iframe.setAttribute('src', 'about:blank');
      if (video) video.pause();

      document.removeEventListener('keydown', onKeydown);
      trigger.focus();
    }

    function onKeydown(event) {
      if (event.key === 'Escape') close();
    }

    trigger.addEventListener('click', open);
    if (closeButton) closeButton.addEventListener('click', close);

    // Click on the backdrop (but not inside the player) closes.
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
    });
  }

})();
