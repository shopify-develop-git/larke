/* dev-video-lightbox.js
   Opens the page's video lightbox from ANY link pointing at its anchor (#video by default).
   The dialog behaviour is dev-video-promo-banner.js's, reproduced (see the section's header):
   native <dialog>, the same open/close motion, media stopped before the exit animation, Escape
   and backdrop-click routed through the same close, scroll lock, focus handed back only to
   keyboard users.

   Wrapped in an IIFE — Shopify serves section JS as classic scripts sharing one global scope. */
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-video-lightbox]').forEach((root) => init(root));
  });

  document.addEventListener('shopify:section:load', (event) => {
    event.target.querySelectorAll('[data-video-lightbox]').forEach((root) => init(root));
  });

  function init(root) {
    if (root.dataset.videoLightboxInit === 'true') return;

    const modal = root.querySelector('[data-video-modal]');
    if (!modal || typeof modal.showModal !== 'function') return;
    root.dataset.videoLightboxInit = 'true';

    const anchor = '#' + (root.dataset.anchor || 'video');
    const closeButton = modal.querySelector('[data-video-close]');
    const video = modal.querySelector('video');
    const inner = modal.querySelector('.dev-video-lightbox__inner');

    let trigger = null;
    let openedViaKeyboard = false;

    // A link is a trigger when it points at the anchor on THIS page: "#video", or a full URL to
    // this same path ending in #video (the rich-text editor sometimes writes the absolute form).
    const isTrigger = (link) => {
      const href = link.getAttribute('href');
      if (!href || !href.endsWith(anchor)) return false;
      if (href === anchor) return true;
      try {
        const url = new URL(href, window.location.href);
        return url.pathname === window.location.pathname && url.hash === anchor;
      } catch (e) {
        return false;
      }
    };

    const linkFrom = (event) => {
      const link = event.target.closest && event.target.closest('a[href]');
      return link && isTrigger(link) ? link : null;
    };

    // preload="none" keeps the film off every page view; warm it once a pointer or keyboard
    // reaches a trigger, so the click plays at once. One warm is enough.
    let warmed = false;
    const warm = (event) => {
      if (warmed || !video || !linkFrom(event)) return;
      warmed = true;
      video.preload = 'auto';
      video.load();
    };
    document.addEventListener('pointerover', warm, { passive: true });
    document.addEventListener('focusin', warm);

    document.addEventListener('click', (event) => {
      const link = linkFrom(event);
      if (!link) return;
      event.preventDefault();
      trigger = link;
      open(event);
    });

    function open(event) {
      if (modal.open) return;
      openedViaKeyboard = !!event && event.detail === 0;
      modal.showModal();
      if (inner) inner.focus({ preventScroll: true });
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
      document.documentElement.classList.add('dev-video-lightbox-scroll-lock');
      animateState('opening');

      if (video) {
        const played = video.play();
        if (played && typeof played.catch === 'function') played.catch(() => {});
      }
    }

    function close() {
      if (!modal.open || modal.dataset.modalState === 'closing') return;
      // Stop the sound FIRST — not after the exit animation.
      if (video) {
        video.pause();
        video.currentTime = 0;
      }
      animateState('closing', () => {
        modal.close();
        cleanup();
      });
    }

    // Idempotent: may run twice if the dialog's own `close` event also fires.
    function cleanup() {
      document.documentElement.classList.remove('dev-video-lightbox-scroll-lock');
      delete modal.dataset.modalState;
      if (!trigger) return;
      trigger.setAttribute('aria-expanded', 'false');
      if (openedViaKeyboard) {
        trigger.focus();
      } else if (document.activeElement === trigger) {
        trigger.blur();
      }
    }

    // Drive the CSS animation from a data attribute; the timeout guarantees the dialog still
    // closes if `animationend` never fires (background tab, reduced motion, a CSS edit).
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
        if (event.target === modal) settle();
      };
      modal.addEventListener('animationend', onEnd);
      window.setTimeout(settle, ms);
    }

    function duration(state) {
      const prop = state === 'closing' ? '--modal-out' : '--modal-in';
      return parseFloat(window.getComputedStyle(modal).getPropertyValue(prop)) || 300;
    }

    if (closeButton) closeButton.addEventListener('click', close);

    // Escape: <dialog> would close instantly, skipping the exit animation. Route it through close().
    modal.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });

    // A click on the dim (the dialog's own box, outside the player) closes it.
    modal.addEventListener('click', (event) => {
      if (event.target === modal) close();
    });

    modal.addEventListener('close', cleanup);
  }
})();
