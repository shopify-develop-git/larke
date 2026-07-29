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

    /* Both cached, re-measured only in layout() (init + resize). They used to be read fresh
       on every call — and render() runs on every scroll frame, so the getComputedStyle and
       getBoundingClientRect in there were a forced style/layout resolution in the middle of
       a scroll. Neither value can change without a resize, which is exactly when layout()
       re-runs. */
    let gapPx = 0;
    let stepWidth = 0;

    /* The set has as many gaps as tiles: one between each pair, plus the one between the last tile
       and the first tile of the next copy. Miss that and the seam drifts by a gap every lap. */
    const measureSet = () =>
      realTiles.reduce((w, tile) => w + tile.getBoundingClientRect().width + gapPx, 0);

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

       This used to switch scroll-snap off around the write and hand it back a frame later:
       `proximity` re-targeted the programmatic scroll after it settled and pulled the jump back to
       where it came from. The track scrolls free now — no snapping anywhere on it — so the write
       is just a write. */
    function jump(to) {
      track.scrollLeft = to;
    }

    /* Forwards only. The track used to wrap both ways, which made it endless in both directions;
       it is now endless to the RIGHT and stops on the left at the first tile, flush.

       That stop is real, not a trick: the browser's own clamp at scrollLeft 0 provides it, and
       nothing here ever pushes the scroll back up past it.

       The threshold is TWO sets rather than one, and that is the whole ergonomics of the thing.
       Wrapping at one set would drop the scroll to 0 every lap and leave the buyer standing on the
       left stop with a dead back arrow. Wrapping at two drops it to one set instead, so there is
       always a full lap of runway behind you — you can always re-read the story you just passed.

       The jump itself is invisible either way: the content repeats on exactly this period, so the
       pixels under the cursor do not move. */
    function wrap() {
      if (!canLoop || setWidth <= 0) return;
      if (track.scrollLeft >= setWidth * 2) jump(track.scrollLeft - setWidth);
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

      /* Forward is endless, so the next arrow never disables. Back has a real end now — the first
         tile, flush left — and the arrow says so there, exactly as it does on a track too short to
         loop at all. */
      if (prev) prev.disabled = track.scrollLeft <= 1;
      if (next) next.disabled = false;
      if (setWidth <= 0) return;

      /* How far through the lap you have READ, measured to the trailing edge of the leading tile —
         not to its leading edge. Parked at the first of four tiles that is a quarter of the story,
         so the bar sits at 25%, which is where the artboard draws it (its stroke is dark to 21.6%
         with the first tile flush left, i.e. at scroll 0 — a bar measured from the leading edge
         would have to be empty there, and it is drawn as not empty).

         It fills to 100% as the fourth tile arrives, then resets: you have come back around, and
         that is exactly what the reset says. */
      const pos = ((track.scrollLeft % setWidth) + setWidth) % setWidth;
      const read = Math.min(1, (pos + stepWidth) / setWidth);
      progress.style.width = read * 100 + '%';
      progress.style.transform = 'translateX(0)';
    }

    /* Re-measure, top up the copies, and put the scroll back in the band. Runs on init and on
       resize: tiles are 407 on desktop and 260 on mobile, so setWidth changes with the breakpoint
       and a stale one would wrap to the wrong pixel. */
    function layout() {
      // The one place the cached measurements refresh — nothing else may read computed
      // style or tile rects.
      gapPx = parseFloat(getComputedStyle(track).columnGap) || 0;
      stepWidth = realTiles[0] ? realTiles[0].getBoundingClientRect().width + gapPx : track.clientWidth;

      if (!canLoop) { render(); return; }

      // How far along the story we are, counted in sets, so the same point survives a re-measure.
      // Zero on the first run, which is what parks the track on the first tile.
      const at = setWidth > 0 ? track.scrollLeft / setWidth : 0;
      setWidth = measureSet();
      syncCopies();
      jump(at * setWidth);
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

      const delta = direction * stepWidth;
      if (!smoothSupported) {
        track.scrollLeft += delta;
        return;
      }
      track.scrollBy({
        left: delta,
        behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      });
    }

    /* ---- Drag to scroll ------------------------------------------------------
       On a phone and on a trackpad the native scroll container already IS the interaction. A mouse
       is the gap it leaves: the native scrollbar is hidden (the artboard draws its own rail
       instead) and a wheel scrolls the page, so up to now the two arrows were the only way a
       desktop visitor could move the story at all.

       Mouse only, on purpose. Touch and pen scroll this element natively already, and taking their
       events over would mean reimplementing rubber-banding and snapping worse than the browser
       does them, on the devices where it does them best.

       No momentum: the track goes exactly as far as the cursor took it and stops the instant the
       button comes up. A throw would keep moving content the visitor has stopped steering, and
       these tiles are text to be read, not a reel to be flicked past.

       Every move is applied as a DELTA from the previous one, never as an offset from where the
       press began. wrap() rewrites scrollLeft underneath a drag that crosses the seam, and an
       absolute origin would be stale from that instant on: the track would kick back by a whole
       set on the next mouse move. */

    const DRAG_SLOP = 4; // px of travel before a press stops being a click

    let dragId = null;
    let lastX = 0;
    let travelled = 0;

    function onDragMove(event) {
      if (event.pointerId !== dragId) return;

      const dx = event.clientX - lastX;
      travelled += Math.abs(dx);

      // The content follows the cursor, so the scroll goes the other way.
      track.scrollLeft -= dx;
      lastX = event.clientX;
    }

    function endDrag(event) {
      if (event && event.pointerId !== dragId) return;

      window.removeEventListener('pointermove', onDragMove);
      window.removeEventListener('pointerup', endDrag);
      window.removeEventListener('pointercancel', endDrag);

      dragId = null;
      track.classList.remove('story-slider__track--dragging');
    }

    track.addEventListener('pointerdown', (event) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;

      dragId = event.pointerId;
      lastX = event.clientX;
      travelled = 0;

      track.classList.add('story-slider__track--dragging');

      /* Listened for on the window, not captured on the track: setPointerCapture would retarget
         the click that follows, and a caption is rich text that may hold a link. This way the
         drag survives the cursor leaving the track and the click still lands where it was aimed. */
      window.addEventListener('pointermove', onDragMove);
      window.addEventListener('pointerup', endDrag);
      window.addEventListener('pointercancel', endDrag);
    });

    // Without this the browser's own image drag starts the moment the press moves over a photo,
    // and the pointer stream stops arriving mid-gesture.
    track.addEventListener('dragstart', (event) => event.preventDefault());

    /* A drag that happens to finish on a link must not also follow it. Capture phase, so it is
       gone before the link sees it; `travelled` is zeroed by the next press, so a real click is
       never caught by this. */
    track.addEventListener(
      'click',
      (event) => {
        if (travelled <= DRAG_SLOP) return;
        event.preventDefault();
        event.stopPropagation();
      },
      true
    );

    if (prev) prev.addEventListener('click', () => scrollByStep(-1));
    if (next) next.addEventListener('click', () => scrollByStep(1));

    /* passive: the handler never calls preventDefault, and saying so keeps scrolling off the
       main thread. rAF-gated on top: scroll events arrive faster than frames during a drag
       or momentum, and wrap()+render() only ever need to run once per painted frame — the
       same queued+rAF pattern as the PDP thumb-scroll indicator. Deferring wrap() a frame is
       safe: the seam jump is invisible at any scroll position past the threshold, and the
       drag applies deltas, never absolute offsets. */
    let scrollQueued = false;
    track.addEventListener(
      'scroll',
      () => {
        if (scrollQueued) return;
        scrollQueued = true;
        requestAnimationFrame(() => {
          scrollQueued = false;
          wrap();
          render();
        });
      },
      { passive: true }
    );

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
