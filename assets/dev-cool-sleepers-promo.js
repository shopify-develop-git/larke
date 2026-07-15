/* dev-cool-sleepers-promo.js — press-logo marquee.

   This is Horizon's OWN stock marquee technique (assets/marquee.js / blocks/_marquee.liquid),
   reimplemented as a plain classic script for this dev section:

     __marquee (wrapper)         ← animated; two identical halves; loops by translate3d(-50%)
       __track (content)         ← duplicated ONCE by the JS to make the second half
         __set (repeated-items)  ← cloned by the JS until the row spans the frame
           <li> logos

   Why the switch, after the pixel-shift version kept blinking on Safari: the old build measured a
   track width and shifted the strip by that many PIXELS, and re-set/corrected it whenever the logos
   finished loading — a value under an already-running timeline, which Safari showed as a jump. The
   stock technique shifts by a PERCENTAGE (-50% of the wrapper), which is exact by construction:
   there is no measured number to be wrong, so a rebuild never moves the visible strip. translate3d
   keeps the whole loop on the GPU, so the wrap is a compositor reposition, not a repaint.

   Wrapped in an IIFE — NOT optional on Shopify. Every section's JS is served as a CLASSIC script,
   so top-level declarations all land in one shared global scope. Keep this wrapper.
*/
(function () {
  // A clone is decoration: it must not be announced, must not carry a duplicate block id, and must
  // not look like an editor block (two elements claiming one block id confuse the theme editor).
  function sanitizeClone(node) {
    node.setAttribute('aria-hidden', 'true');
    node.querySelectorAll('img').forEach((img) => img.setAttribute('alt', ''));
    node.querySelectorAll('[data-shopify-editor-block]').forEach((el) => {
      el.removeAttribute('data-shopify-editor-block');
    });
    node.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
    if (node.hasAttribute('id')) node.removeAttribute('id');
  }

  // Extra whole-set copies added to each half BEYOND what's needed to fill the frame. The loop wraps
  // once per half, so padding the half with N more sets makes the wrap (and any seam artifact on
  // Safari) happen far less often — several clean scroll-throughs pass between wraps — while the
  // duration scaling below keeps the on-screen SPEED identical. Requested as "just duplicate the
  // photos ~3 times so the first few scrolls are clean." Bump this number for even longer gaps.
  const BUFFER_SETS = 3;

  function build(root) {
    const wrapper = root.querySelector('[data-marquee-wrapper]');
    const content = wrapper && wrapper.querySelector('[data-marquee-content]');
    const set = content && content.querySelector('[data-marquee-set]');
    if (!wrapper || !content || !set) return;

    // Start from the single authored set every time: the number of fill copies depends on the
    // viewport and on the (now-loaded) logo widths, so a rebuild must not stack on the last one.
    content.querySelectorAll('[data-marquee-fill]').forEach((n) => n.remove());
    wrapper.querySelectorAll('[data-marquee-dup]').forEach((n) => n.remove());

    const frame = root.clientWidth;
    const one = set.getBoundingClientRect().width;
    // Zero while the logos are still laying out — don't guess and don't touch the DOM; the load /
    // resize handlers below call back the moment the set has a real width.
    if (!frame || !one) return;

    // Fill the content with whole copies of the set until it spans the frame (so a -50% shift never
    // drags empty space into view), then add the buffer copies on top.
    const cover = Math.ceil(frame / one);
    const copies = cover + BUFFER_SETS;
    for (let i = 1; i < copies; i += 1) {
      const fill = set.cloneNode(true);
      fill.setAttribute('data-marquee-fill', '');
      sanitizeClone(fill);
      content.appendChild(fill);
    }

    // Duplicate the whole content once → two identical halves. The CSS loops by exactly one half.
    const dup = content.cloneNode(true);
    dup.setAttribute('data-marquee-dup', '');
    dup.removeAttribute('data-marquee-content');
    sanitizeClone(dup);
    wrapper.appendChild(dup);

    // Keep the scroll SPEED constant no matter how many copies we added. The merchant duration is the
    // time to travel one frame-cover; scale it up by how much longer the buffered half is, so the
    // strip moves at the same px/sec and simply wraps less often.
    const base = parseFloat(getComputedStyle(root).getPropertyValue('--marquee-duration')) || 30;
    wrapper.style.setProperty('--marquee-duration', `${(base * copies) / cover}s`);
  }

  function init(root) {
    if (root.dataset.marqueeInit === 'true') return;
    root.dataset.marqueeInit = 'true';

    const run = () => build(root);
    run();

    // The set's own logos finishing layout, and the frame width changing, are the two things that
    // change how many copies are needed. Eager loading (see the Liquid) means these fire off-screen
    // at page load, so the strip is already built and stable by the time it is scrolled into view.
    const set = root.querySelector('[data-marquee-set]');
    if (set) {
      set.querySelectorAll('img').forEach((img) => {
        if (img.complete) return;
        img.addEventListener('load', run, { once: true });
        img.addEventListener('error', run, { once: true });
      });
    }

    if ('ResizeObserver' in window) {
      // Only the frame's WIDTH affects the copy count. build() adds siblings inside the clipped,
      // fixed-width root, so it cannot change the root's own box — no feedback loop — but we still
      // gate on a real width change so vertical jitter (mobile URL bar) never rebuilds.
      let lastWidth = root.clientWidth;
      const observer = new ResizeObserver(() => {
        if (root.clientWidth === lastWidth) return;
        lastWidth = root.clientWidth;
        run();
      });
      observer.observe(root);
    }

    // `load` fires regardless of the rendering lifecycle, unlike a ResizeObserver in a throttled or
    // backgrounded tab; it is the backstop that guarantees a build once every resource is in.
    window.addEventListener('load', run);
  }

  function boot() {
    document.querySelectorAll('[data-marquee-root]').forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  // The theme editor re-renders a section without a fresh DOMContentLoaded.
  document.addEventListener('shopify:section:load', (event) => {
    event.target.querySelectorAll('[data-marquee-root]').forEach(init);
  });
})();
