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

    // Torn down and rebuilt only when the copy COUNT changes — see build() for why.
    const buildClones = (needed) => {
      marquee.querySelectorAll('[data-marquee-clone]').forEach((node) => node.remove());

      for (let i = 0; i < needed; i += 1) {
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
    };

    /* NON-DESTRUCTIVE by design. The old build() wiped every clone AND cleared --marquee-shift
       (→ 0) on EVERY call. That is harmless at startup, but the observers below also fire it
       mid-life — and on mobile they fire a BURST, because the press logos are lazy <img>s sitting
       far below the fold: each one that finishes loading as you scroll in nudges the track's width
       and re-runs build(). Every one of those runs briefly set --marquee-shift to 0, snapping the
       strip back to translateX(0) before re-setting it — that repeated snap is the "glitching
       logos" QA saw on mobile. (The seam geometry itself is exact: one track's width == the gap
       between copies, measured.)

       So now: clones are rebuilt ONLY when the copy count actually changes; a mere width nudge just
       refreshes --marquee-shift in place (sub-pixel, invisible); and the shift is never parked at 0
       while the strip is live. */
    const build = () => {
      // Reduced motion: the CSS kills the animation and hides the aria-hidden copies anyway, so
      // cloning would only add DOM nobody will ever see. This is the ONLY path that clears the
      // shift — and here the animation is already `none`, so there is nothing to snap.
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        marquee.querySelectorAll('[data-marquee-clone]').forEach((node) => node.remove());
        marquee.style.removeProperty('--marquee-shift');
        return;
      }

      const one = track.getBoundingClientRect().width;
      const frame = root.clientWidth;
      // Zero while the logos are still laying out. Don't guess, and DON'T wipe what is already
      // running — the observers below call back the moment the track has a real width.
      if (!one || !frame) return;

      // The first copy is the one being slid off to the left. Everything BEHIND it has to cover the
      // frame, or the tail of the strip arrives before the next copy does — which is exactly the
      // gap this replaces. +1 for the copy that is leaving.
      const copies = Math.ceil(frame / one) + 1;
      const needed = copies - 1;
      if (needed !== marquee.querySelectorAll('[data-marquee-clone]').length) {
        buildClones(needed);
      }

      // Shift by exactly one copy. On restart the next copy is standing where the first began.
      // Refreshed on every measurement so the seam stays exact as the logos settle — but only ever
      // to a real width, never to 0.
      marquee.style.setProperty('--marquee-shift', `${one}px`);
    };

    // Every logo has settled (loaded or errored), so the measured track width is now final.
    const logosSettled = () =>
      [...track.querySelectorAll('img')].every((img) => img.complete);

    /* Start the animation ONCE, and only after the logos have their real width. The old build
       ran the animation from page load — but the logos are lazy <img>s far below the fold, so at
       load they are still 0-wide and the track measured ~half its real width. The animation began
       against that wrong width, and the moment you scrolled the section in and the logos finally
       loaded, the first correct measurement moved --marquee-shift UNDER an already-running
       timeline — the strip visibly jumped. Scroll-reveal (which fades + rises this block in at the
       same instant) turned that into the "blink + jump" the client sees.

       So: nothing animates until the width is real. is-animating is added exactly once, which
       starts the keyframes from phase 0 with the correct shift — a clean, jump-free start. */
    const startIfReady = () => {
      if (marquee.classList.contains('is-animating')) return;
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      if (!logosSettled()) return;
      build();
      if (marquee.style.getPropertyValue('--marquee-shift')) {
        marquee.classList.add('is-animating');
      }
    };

    // Once running, keep the clone count / shift in sync as the frame changes; before running,
    // keep trying to start. build() only ever refreshes to a real width, so a resize never zeroes.
    const onChange = () => {
      if (marquee.classList.contains('is-animating')) build();
      else startIfReady();
    };

    startIfReady();

    /* The frame's width changing and the logos finishing layout both change the sums. A
       ResizeObserver on the track catches the load, one on the root catches frame changes. They
       cannot feed themselves — build() only touches siblings of the track and a custom property, so
       neither observed box moves. `load`/`resize` run alongside: ResizeObserver callbacks ride the
       rendering lifecycle, so a throttled/background tab can withhold them indefinitely. */
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(onChange);
      observer.observe(track);
      observer.observe(root);
    }

    window.addEventListener('load', onChange);
    window.addEventListener('resize', onChange);

    // A lazy logo finishing after the observers are wired is the common case on mobile — react to
    // each one so the strip starts the instant the last one lands (or errors, so a broken logo
    // can't freeze the strip forever).
    track.querySelectorAll('img').forEach((img) => {
      if (img.complete) return;
      img.addEventListener('load', onChange, { once: true });
      img.addEventListener('error', onChange, { once: true });
    });
  }
})();
