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
  /* The video lightbox. The markup is a native <dialog>, so the focus trap, Escape, the inertness of
     the page behind and the click-swallowing backdrop all come from the element. What is left here
     is the part the platform does not give us: the motion, the scroll lock, and the media. */

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
    if (!trigger || !modal || typeof modal.showModal !== 'function') return;

    section.dataset.videoPromoInit = 'true';

    const closeButton = modal.querySelector('[data-video-close]');
    const video = modal.querySelector('video');
    const iframe = modal.querySelector('iframe');
    const embedSrc = iframe ? iframe.getAttribute('data-src') : null;

    /* The source is `preload="none"`, so on a cold click the browser starts fetching a 4.5Mbps HD
       file only once the lightbox is already open — the old build showed a spinner where the video
       should have been. Warm it the moment the pointer or the keyboard reaches the play button:
       by the time the click lands the first frames are usually in. `once` — one warm is enough. */
    if (video) {
      const warm = () => {
        video.preload = 'auto';
        video.load();
      };
      trigger.addEventListener('pointerenter', warm, { once: true });
      trigger.addEventListener('focus', warm, { once: true });
    }

    function open() {
      modal.showModal();
      trigger.setAttribute('aria-expanded', 'true');
      document.documentElement.classList.add('video-promo-banner-scroll-lock');

      animateState('opening');

      if (iframe && embedSrc) iframe.setAttribute('src', embedSrc);
      if (video) {
        const played = video.play();
        // Autoplay can still be refused (a background tab, a strict policy). The player has its own
        // controls, so a refusal leaves the user with a poster and a play button, not a dead box.
        if (played && typeof played.catch === 'function') played.catch(() => {});
      }
    }

    function close() {
      if (!modal.open || modal.dataset.modalState === 'closing') return;

      // Stop the media FIRST. Waiting for the exit animation to finish would leave the sound playing
      // behind a lightbox that is visibly on its way out.
      if (iframe) iframe.setAttribute('src', 'about:blank');
      if (video) {
        video.pause();
        // Back to the first frame: reopening the lightbox should start the film, not resume it.
        video.currentTime = 0;
      }

      animateState('closing', () => {
        modal.close();
        // Cleanup is called HERE, on the way out, and not left to the dialog's `close` event. That
        // event was measured not firing at all in this theme — closing the dialog by hand left the
        // page scroll-locked and the focus stranded on a button nobody could see any more. `close`
        // is still listened for below, but only as a belt: this is the braces.
        cleanup();
      });
    }

    // Idempotent on purpose — it can run twice if the `close` event does fire.
    function cleanup() {
      trigger.setAttribute('aria-expanded', 'false');
      document.documentElement.classList.remove('video-promo-banner-scroll-lock');
      delete modal.dataset.modalState;
      // Focus goes back to the button that opened the lightbox. <dialog> is supposed to restore it
      // on its own; measured here, it left the focus sitting on the close button of a dialog that
      // had already gone, so a keyboard user's next Tab started from nowhere.
      trigger.focus();
    }

    /* Drive the CSS animation from a data attribute and wait for it to land.
       The timeout is not belt-and-braces: `animationend` never fires if the animation does not run —
       a background tab, a browser that skips it, a future CSS edit that drops the keyframes — and
       without it the dialog would hang open forever with no way to shut it. */
    function animateState(state, done) {
      modal.dataset.modalState = state;

      const ms = duration(state) + 50;
      let settled = false;

      const settle = () => {
        if (settled) return;
        settled = true;
        modal.removeEventListener('animationend', onEnd);
        delete modal.dataset.modalState;
        if (done) done();
      };

      const onEnd = (event) => {
        // Only the dialog's own animation counts — the player inside it runs one too, and it lands
        // first. Acting on that one would cut the dim's fade off half-way.
        if (event.target === modal) settle();
      };

      modal.addEventListener('animationend', onEnd);
      window.setTimeout(settle, ms);
    }

    // The durations live in the section's token block, so the motion here and the keyframes in the
    // CSS cannot drift apart.
    function duration(state) {
      const prop = state === 'closing' ? '--modal-out' : '--modal-in';
      return parseFloat(window.getComputedStyle(modal).getPropertyValue(prop)) || 300;
    }

    trigger.addEventListener('click', open);
    if (closeButton) closeButton.addEventListener('click', close);

    /* Escape. <dialog> handles the key itself and closes INSTANTLY — which would throw the lightbox
       off the screen with no exit animation at all. Take the default over and run the same close as
       the button, so every route out of the lightbox looks the same. */
    modal.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });

    // A click on the backdrop — the dialog's own box, outside the player — closes it.
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
    });

    // The belt to close()'s braces: if anything ever shuts the dialog by a route we do not own, the
    // page still comes back unlocked. Not relied upon — see the note in close().
    modal.addEventListener('close', cleanup);
  }
})();
