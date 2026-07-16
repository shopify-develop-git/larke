/* dev-story-slider.js
 *
 * The track is a NATIVE scroll container (see the CSS). This file keeps that and adds two things:
 *
 *   1. it LOOPS — the real tiles are cloned until there is runway either side, and the scroll is
 *      kept inside the middle copy, so the track never reaches an end and the arrows never disable
 *   2. the bar under the track fills from the left across ONE lap of the real tiles
 *
 * Why loop: the artboard draws each of the four tiles twice (45205:1559 — eight tiles, four
 * unique). Owner's call that this means the carousel loops.
 *
 * Why the bar FILLS rather than floats: the artboard draws a single stroke that is dark from the
 * left edge up to a point and light after it. That is a progress bar, not a scrollbar thumb. This
 * file used to size it as a thumb (width = clientWidth / scrollWidth), which with four tiles came
 * out 78% wide and moved 22% — nothing like the artboard, and meaningless once the track loops,
 * since a loop has no global position to report. It now reports the lap.
 *
 * The clones are made HERE, not in Liquid, on purpose. With JS off the track still renders the real
 * tiles once and scrolls to a normal end — the mobile design, which has no controls at all. Cloning
 * in Liquid would ship the story twice to crawlers and read it twice to a screen reader; the clones
 * carry aria-hidden for the same reason.
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

    const realTiles = Array.from(track.children);

    /* One tile cannot loop against itself — such a track stays finite and keeps the end stops. */
    const canLoop = realTiles.length > 1;

    let setWidth = 0; // ONE set of real tiles, including the gap trailing the last one

    const gap = () => parseFloat(getComputedStyle(track).columnGap) || 0;

    /* The set has as many gaps as tiles: one between each pair, plus the one between the last tile
       and the first tile of the next copy. Miss that and the seam drifts by a gap every lap. */
    const measureSet = () =>
      realTiles.reduce((w, tile) => w + tile.getBoundingClientRect().width + gap(), 0);

    const step = () =>
      realTiles[0] ? realTiles[0].getBoundingClientRect().width + gap() : track.clientWidth;

    /* Enough copies that the middle band [setWidth, 2*setWidth) is reachable: the track must be at
       least one viewport plus two sets wide, or scrollLeft cannot sit in the band and the wrap would
       fight the browser's own clamp at 0. Three covers the artboard's four 407px tiles; a merchant
       with two short tiles on a wide screen needs more. */
    const neededCopies = () =>
      !canLoop || setWidth <= 0 ? 1 : Math.max(3, Math.ceil(track.clientWidth / setWidth) + 2);

    function syncCopies() {
      const have = 1 + track.querySelectorAll('[data-story-slider-clone]').length / realTiles.length;
      const want = neededCopies();
      if (want <= have) return;

      const frag = document.createDocumentFragment();
      for (let copy = have; copy < want; copy += 1) {
        realTiles.forEach((tile) => {
          const clone = tile.cloneNode(true);
          clone.setAttribute('aria-hidden', 'true');
          clone.setAttribute('data-story-slider-clone', '');
          clone.removeAttribute('id');
          /* A clone is scenery: never a tab stop, never an editor target. */
          clone.querySelectorAll('a, button, [tabindex]').forEach((el) => { el.tabIndex = -1; });
          /* The clones are duplicates of tiles that are already on screen, so waiting for them to
             scroll into view only buys a blank tile mid-swipe. */
          clone.querySelectorAll('img').forEach((img) => { img.loading = 'eager'; });
          frag.appendChild(clone);
        });
      }
      track.appendChild(frag);
    }

    /* Move scrollLeft by exactly one set. The pixels under the cursor do not change, because the
       content repeats on exactly that period — so the jump is invisible.

       scroll-snap is switched off around the write and restored on the next frame. `proximity`
       snapping re-targets a programmatic scroll after it settles, which was pulling the jump back
       to where it came from — the track then sat at 0 with a dead left arrow instead of wrapping. */
    function jump(to) {
      const snap = track.style.scrollSnapType;
      track.style.scrollSnapType = 'none';
      track.scrollLeft = to;
      requestAnimationFrame(() => { track.style.scrollSnapType = snap; });
    }

    function wrap() {
      if (!canLoop || setWidth <= 0) return;
      const x = track.scrollLeft;
      if (x < setWidth) jump(x + setWidth);
      else if (x >= setWidth * 2) jump(x - setWidth);
    }

    function render() {
      if (!progress) return;

      if (!canLoop) {
        const max = track.scrollWidth - track.clientWidth;
        const done = max <= 1 ? 1 : track.scrollLeft / max;
        progress.style.width = done * 100 + '%';
        if (prev) prev.disabled = max <= 1 || track.scrollLeft <= 1;
        if (next) next.disabled = max <= 1 || track.scrollLeft >= max - 1;
        return;
      }

      /* Looping: there is no end to stop at, so the arrows never disable. */
      if (prev) prev.disabled = false;
      if (next) next.disabled = false;
      if (setWidth <= 0) return;

      /* How far through the lap you have READ, measured to the trailing edge of the leading tile —
         not to its leading edge. Parked at the first of four tiles that is a quarter of the story,
         so the bar sits at 25%, which is where the artboard draws it (its stroke is dark to 21.6%
         with the first tile flush left, i.e. at scroll 0 — a bar measured from the leading edge
         would have to be empty there, and it is drawn as not empty).

         It fills to 100% as the fourth tile arrives, then resets: you have come back around, and
         that is exactly what the reset says. */
      const pos = (((track.scrollLeft - setWidth) % setWidth) + setWidth) % setWidth;
      const read = Math.min(1, (pos + step()) / setWidth);
      progress.style.width = read * 100 + '%';
      progress.style.transform = 'translateX(0)';
    }

    /* Re-measure, top up the copies, and put the scroll back in the band. Runs on init and on
       resize: tiles are 407 on desktop and 260 on mobile, so setWidth changes with the breakpoint
       and a stale one would wrap to the wrong pixel. */
    function layout() {
      if (!canLoop) { render(); return; }

      const lap = setWidth > 0 ? (track.scrollLeft - setWidth) / setWidth : 0;
      setWidth = measureSet();
      syncCopies();
      jump(setWidth + lap * setWidth);
      render();
    }

    let smoothSupported = false;
    try {
      const probe = { get behavior() { smoothSupported = true; return 'auto'; } };
      track.scrollBy(probe);
    } catch (e) {
      smoothSupported = false;
    }

    function scrollByStep(direction) {
      /* Wrap BEFORE the animation, never during it: a smooth scroll targets an absolute position,
         so moving scrollLeft out from under it mid-flight cancels or lurches it. One step is a
         single tile, always shorter than a set, so the whole animation stays inside the track. */
      wrap();

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
    track.addEventListener('scroll', () => { wrap(); render(); }, { passive: true });

    if ('ResizeObserver' in window) {
      new ResizeObserver(layout).observe(track);
    } else {
      window.addEventListener('resize', layout);
    }

    layout();
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
     the listeners die with it — and the clones go with the old DOM. Re-init the rebuilt node. */
  document.addEventListener('shopify:section:load', (event) => initAll(event.target));
})();
