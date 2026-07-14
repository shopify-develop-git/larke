/* dev-cool-sleepers-promo.js

   Wrapped in an IIFE — NOT optional on Shopify. Every section's JS is served as a CLASSIC script,
   so top-level declarations all land in one shared global scope and the last file to load silently
   overwrites everyone else's `init`. Nothing may leak. Keep this wrapper.
*/
(function () {
  /* The press-logo marquee.

     The template renders ONE track. How many copies are needed to make the loop endless is a fact
     about the browser — the track's real width against the frame's real width — so it cannot be
     decided in Liquid, and the old build's guess of "two" was wrong: two copies are seamless only
     while a single track is at least as wide as the frame. Five logos measure 839px against a
     1512px viewport, so the -50% reset dragged 673px of nothing into view on every loop.
  */

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-marquee-root]').forEach(init);
  });

  // The theme editor re-renders a section without a fresh DOMContentLoaded.
  document.addEventListener('shopify:section:load', (event) => {
    event.target.querySelectorAll('[data-marquee-root]').forEach(init);
  });

  function init(root) {
    if (root.dataset.marqueeInit === 'true') return;

    const marquee = root.querySelector('[data-marquee]');
    const track = marquee && marquee.querySelector('[data-marquee-track]');
    if (!marquee || !track) return;

    root.dataset.marqueeInit = 'true';

    const build = () => {
      // Rebuilt, never appended to: the number of copies depends on the viewport, and a window that
      // narrows needs FEWER of them. Appending would leave the old ones behind.
      marquee.querySelectorAll('[data-marquee-clone]').forEach((node) => node.remove());
      marquee.style.removeProperty('--marquee-shift');

      // Reduced motion: the CSS kills the animation and hides the aria-hidden copies anyway, so
      // cloning would only add DOM nobody will ever see.
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

      const one = track.getBoundingClientRect().width;
      const frame = root.clientWidth;
      // Zero while the logos are still laying out. Don't guess — the observer below calls back the
      // moment the track has a real width.
      if (!one || !frame) return;

      // The first copy is the one being slid off to the left. Everything BEHIND it has to cover the
      // frame, or the tail of the strip arrives before the next copy does — which is exactly the
      // gap this replaces. +1 for the copy that is leaving.
      const copies = Math.ceil(frame / one) + 1;

      for (let i = 1; i < copies; i += 1) {
        const clone = track.cloneNode(true);
        clone.setAttribute('aria-hidden', 'true');
        clone.setAttribute('data-marquee-clone', '');

        // A clone is decoration. It must not be announced, and it must not look like a block to the
        // theme editor — two elements claiming the same block id make the editor select the wrong one.
        clone.querySelectorAll('img').forEach((img) => img.setAttribute('alt', ''));
        clone.querySelectorAll('[data-shopify-editor-block]').forEach((el) => {
          el.removeAttribute('data-shopify-editor-block');
        });
        clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));

        marquee.appendChild(clone);
      }

      // Shift by exactly one copy. On restart the second copy is standing where the first began.
      marquee.style.setProperty('--marquee-shift', `${one}px`);
    };

    build();

    /* Two things change the sums: the logos finishing their layout (the track's width goes from 0 to
       real), and the frame's width changing. A ResizeObserver on the ORIGINAL track catches the
       first, one on the root catches the second — including the frame changing without the window
       doing so, which a resize listener alone would miss.

       It cannot feed itself: build() only removes and appends SIBLINGS of the track and sets a
       custom property on the marquee. Neither the track's box nor the root's box moves, so neither
       observer re-fires on its own work.

       The window listeners are NOT a fallback for old browsers — they run alongside. ResizeObserver
       delivers its callbacks on the rendering lifecycle, so a throttled or background document can
       hold them indefinitely (measured: in a hidden tab it does not fire even once, not even the
       initial callback on observe()). If the track had no width at DOMContentLoaded and the observer
       is the only thing waiting, the marquee would never get built at all. `load` fires regardless.
       build() rebuilds from scratch, so running it twice costs nothing. */
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(build);
      observer.observe(track);
      observer.observe(root);
    }

    window.addEventListener('load', build);
    window.addEventListener('resize', build);
  }
})();
