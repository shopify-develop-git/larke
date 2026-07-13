/* dev-story-slider.js
 *
 * The track is a NATIVE scroll container (see the CSS). This file does not implement a carousel —
 * it only does the two things the artboard's controls promise:
 *
 *   1. the arrows nudge the track by one tile
 *   2. the rail reports where the track is, as a scrollbar thumb
 *
 * Everything still works with this file absent: touch, trackpad, and the arrow keys already scroll
 * the track, and the section degrades to the mobile design, which has no controls at all. That is
 * why nothing here is required for the content to be reachable.
 */
(() => {
  const SECTION = '.story-slider';

  function init(root) {
    if (root.dataset.storySliderReady === 'true') return;
    root.dataset.storySliderReady = 'true';

    const track = root.querySelector('[data-story-slider-track]');
    const progress = root.querySelector('[data-story-slider-progress]');
    const prev = root.querySelector('[data-story-slider-prev]');
    const next = root.querySelector('[data-story-slider-next]');
    if (!track) return;

    /* One tile plus one gap — read from the DOM rather than from a hardcoded 407/24, so the step
       stays correct at the mobile 260/16 and after any token change. */
    function step() {
      const tile = track.querySelector('.story-slider__tile');
      if (!tile) return track.clientWidth;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return tile.getBoundingClientRect().width + gap;
    }

    /* `maxScroll` can be 0 when every tile already fits (a merchant with two slides on a wide
       screen). Guard the division, and in that case show a full rail rather than a zero-width one —
       "nothing to scroll" reads better as complete than as empty. */
    function render() {
      const max = track.scrollWidth - track.clientWidth;

      if (max <= 1) {
        progress.style.width = '100%';
        progress.style.transform = 'translateX(0)';
        if (prev) prev.disabled = true;
        if (next) next.disabled = true;
        return;
      }

      const ratio = track.clientWidth / track.scrollWidth;
      const offset = track.scrollLeft / track.scrollWidth;

      progress.style.width = ratio * 100 + '%';
      /* Offset the thumb in RAIL widths, not thumb widths: translateX(%) resolves against the
         element's own width, so the travel has to be divided by the thumb's own ratio. */
      progress.style.transform = 'translateX(' + (offset / ratio) * 100 + '%)';

      if (prev) prev.disabled = track.scrollLeft <= 1;
      if (next) next.disabled = track.scrollLeft >= max - 1;
    }

    /* Feature-detect ScrollToOptions rather than assume it. Safari below 15.4 ignores the options
       OBJECT entirely — `scrollBy({left: x})` there is a silent no-op, so the arrows would look
       alive and do nothing. Falling back to a plain scrollLeft assignment keeps them working; the
       browser's own `scroll-behavior` still smooths it where that is supported. */
    let smoothSupported = false;
    try {
      const probe = { get behavior() { smoothSupported = true; return 'auto'; } };
      track.scrollBy(probe);
    } catch (e) {
      smoothSupported = false;
    }

    function scrollByStep(direction) {
      const delta = direction * step();

      if (!smoothSupported) {
        track.scrollLeft += delta;
        return;
      }

      track.scrollBy({
        left: delta,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    }

    if (prev) prev.addEventListener('click', () => scrollByStep(-1));
    if (next) next.addEventListener('click', () => scrollByStep(1));

    /* passive: the handler never calls preventDefault, and saying so keeps scrolling off the
       main thread. */
    track.addEventListener('scroll', render, { passive: true });

    /* The rail depends on clientWidth/scrollWidth, so it has to be recomputed whenever the track
       is resized — a viewport change, but also a late-loading image changing a tile's height. */
    if ('ResizeObserver' in window) {
      new ResizeObserver(render).observe(track);
    } else {
      window.addEventListener('resize', render);
    }

    render();
  }

  function initAll(scope) {
    (scope || document).querySelectorAll(SECTION).forEach(init);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAll());
  } else {
    initAll();
  }

  /* Theme editor: Shopify tears the section's DOM down and rebuilds it on every setting change, so
     the listeners above die with it. Re-init the rebuilt node. */
  document.addEventListener('shopify:section:load', (event) => initAll(event.target));
})();
