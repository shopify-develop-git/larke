/* dev-story-slider.js
 *
 * The track is a NATIVE scroll container (see the CSS). This file does not replace that with a
 * carousel — it does three things:
 *
 *   1. the arrows nudge the track by one tile
 *   2. at the end, the next arrow returns to the first tile (and the prev arrow, at the start,
 *      jumps to the end) — so neither arrow ever dead-ends
 *   3. the bar under the track fills from the left as the track advances
 *
 * Owner's call: the track wraps back to the first tile rather than looping seamlessly. It used to
 * clone the tiles and keep the scroll inside a middle copy, which never reached an end at all; that
 * is gone. The artboard draws each of the four tiles twice (45205:1559 — eight tiles, four unique),
 * which is where the wrap idea comes from, but the wrap is a jump back, not an endless track.
 *
 * Why the bar FILLS rather than floats: the artboard draws a single stroke, dark from the left edge
 * up to a point and light after — a progress bar, not a scrollbar thumb. It used to be sized as a
 * thumb (width = clientWidth / scrollWidth), which with four tiles came out 78% wide and travelled
 * 22%: nearly the whole rail, dark, and barely moving.
 *
 * Everything still works with this file absent: touch, trackpad and the arrow keys already scroll
 * the track, and the section degrades to the mobile design, which has no controls at all.
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

    const maxScroll = () => track.scrollWidth - track.clientWidth;

    /* One tile plus one gap — read from the DOM rather than from a hardcoded 407/24, so the step
       stays correct at the mobile 260/16 and after any token change. */
    function step() {
      const tile = track.querySelector('.story-slider__tile');
      if (!tile) return track.clientWidth;
      const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
      return tile.getBoundingClientRect().width + gap;
    }

    /* A tile-width of slack: "at the end" has to mean the last tile is fully in view, not that
       scrollLeft hit its exact maximum. Sub-pixel scroll positions and scroll-snap both mean the
       exact maximum is often never reported. */
    const EDGE = 2;
    const atEnd = () => track.scrollLeft >= maxScroll() - EDGE;
    const atStart = () => track.scrollLeft <= EDGE;

    function render() {
      if (!progress) return;

      const max = maxScroll();

      /* Nothing to scroll — every tile already fits. A full rail reads as "all of it is here";
         an empty one would read as broken. */
      if (max <= 1) {
        progress.style.width = '100%';
        progress.style.transform = 'translateX(0)';
        if (prev) prev.disabled = true;
        if (next) next.disabled = true;
        return;
      }

      /* The arrows never disable: at either end they wrap round rather than stop. */
      if (prev) prev.disabled = false;
      if (next) next.disabled = false;

      /* The bar reads in STORIES, not in scrolled pixels. Parked at the first of four tiles it
         starts at a quarter — which is where the artboard draws it (its stroke is dark to 21.6%
         with the first tile flush left, i.e. at scroll 0). Straight scrollLeft/max would have to be
         empty there, and the artboard draws it as not empty.

         It reaches a full bar at the end of the track, so the jump home means something: the bar
         emptying back to one quarter IS the "you are back at the first tile" signal.

         The floor is 1/tiles rather than a flat 25% so a merchant with three or six slides gets a
         bar that still starts on its own first story. */
      const tiles = track.querySelectorAll('.story-slider__tile').length || 1;
      const first = 1 / tiles;
      progress.style.width = (first + (1 - first) * (track.scrollLeft / max)) * 100 + '%';
      progress.style.transform = 'translateX(0)';
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

    const behavior = () =>
      matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

    function scrollTo(left) {
      if (!smoothSupported) {
        track.scrollLeft = left;
        return;
      }
      track.scrollTo({ left, behavior: behavior() });
    }

    function go(direction) {
      const max = maxScroll();
      if (max <= 1) return;

      /* The wrap. Sent back to the very first tile from the end, and to the very last from the
         start — a deliberate jump, not a seamless loop: this track HAS ends, and arriving back at
         the beginning is meant to be seen. */
      if (direction > 0 && atEnd()) { scrollTo(0); return; }
      if (direction < 0 && atStart()) { scrollTo(max); return; }

      scrollTo(track.scrollLeft + direction * step());
    }

    if (prev) prev.addEventListener('click', () => go(-1));
    if (next) next.addEventListener('click', () => go(1));

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
