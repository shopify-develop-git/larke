/* dev-main-product.js

   Wrapped in an IIFE — NOT optional on Shopify. Every section's JS is served as a CLASSIC script,
   so top-level declarations all land in ONE shared global scope and the last file to load silently
   overwrites everyone else's `init`. Nothing may leak. Keep the wrapper.
*/
(function () {
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-main-product]').forEach((root) => init(root));
  });

  function init(root) {
    initGallery(root);
    initVariants(root);
    initThumbScroll(root);
  }

  /* ---- Gallery ---------------------------------------------------------- */

  function initGallery(root) {
    const slides = Array.from(root.querySelectorAll('[data-slide]'));
    const thumbs = Array.from(root.querySelectorAll('[data-thumb]'));
    const prev = root.querySelector('[data-prev]');
    const next = root.querySelector('[data-next]');
    const gallery = root.querySelector('.dev-main-product__gallery');

    let index = 0;

    /* The hidden slides' image URLs ride in data-defer-* — the section file explains why
       loading="lazy" cannot defer them (stacked absolutely inside the on-screen stage, every
       hidden slide "intersects" the viewport, so all of them raced the LCP at full width).
       Attaching the URLs is idempotent: the slide being shown hydrates on demand, and the
       whole set hydrates together once the page has loaded and the browser has gone idle,
       which restores the swipe-is-instant preloading the stacking was built for. */
    function hydrate(slide) {
      slide.querySelectorAll('img[data-defer-src]').forEach((img) => {
        if (img.dataset.deferSizes) img.sizes = img.dataset.deferSizes;
        if (img.dataset.deferSrcset) img.srcset = img.dataset.deferSrcset;
        img.src = img.dataset.deferSrc;
        delete img.dataset.deferSrc;
        delete img.dataset.deferSrcset;
        delete img.dataset.deferSizes;
      });
    }

    function hydrateAll() {
      slides.forEach(hydrate);
    }

    function idleHydrate() {
      if ('requestIdleCallback' in window) {
        requestIdleCallback(hydrateAll, { timeout: 3000 });
      } else {
        setTimeout(hydrateAll, 1500);
      }
    }

    if (document.readyState === 'complete') {
      idleHydrate();
    } else {
      window.addEventListener('load', idleHydrate, { once: true });
    }

    /* The gallery videos carry no controls — they are muted, looping motion sitting between the
       photos, so the slide the buyer is on is the one that plays and every other one is stopped.

       Pausing the ones we left is the half that was always here: a video still running behind a
       hidden slide is how a product page ends up with sound coming from nowhere. Starting the
       active one is the half the markup used to do with an `autoplay` attribute, and it belongs
       here instead: all slides are in the DOM at once, so `autoplay` would have every video in
       the gallery pulling its stream on page load whether or not it is the one on screen.

       currentTime is reset so coming back to the clip starts it from the top rather than from
       wherever it was abandoned — a half-played frame is not a product photo.

       play() returns a promise that rejects when the browser refuses (a data-saver profile, or a
       muted-autoplay block). Swallowed: the poster staying up is the correct fallback, and an
       unhandled rejection in the console is not. */
    function syncVideo() {
      slides.forEach((slide, n) => {
        slide.querySelectorAll('video').forEach((video) => {
          if (n !== index) {
            video.pause();
            // Only once metadata exists. With readyState HAVE_NOTHING there is no timeline to
            // seek yet, and the assignment is at best ignored and at worst throws.
            if (video.readyState > 0) video.currentTime = 0;
            return;
          }
          const started = video.play();
          if (started && typeof started.catch === 'function') started.catch(() => {});
        });
      });
    }

    function show(i) {
      // Wrap around: the artboard draws no disabled arrow, so there is no end to hit.
      index = (i + slides.length) % slides.length;

      // Before anything toggles: a deferred image must be requested the moment its slide is
      // asked for, or a click that beats the idle hydration lands on an empty frame.
      hydrate(slides[index]);

      // The approval seal vouches for the product, not for every photo: it belongs to the first
      // image only. The server marks slide 0 active with the seal visible, so navigation is the
      // only time this state can change — and show() is every navigation path (arrows, thumbs,
      // and the lightbox's zoom-select).
      if (gallery) {
        gallery.classList.toggle('dev-main-product__gallery--off-first', index !== 0);
      }

      slides.forEach((slide, n) => {
        slide.classList.toggle('dev-main-product__slide--active', n === index);
      });

      thumbs.forEach((thumb, n) => {
        const on = n === index;
        thumb.classList.toggle('dev-main-product__thumb--active', on);
        thumb.setAttribute('aria-current', String(on));
      });

      syncVideo();

      const active = thumbs[index];
      if (active && active.parentElement && active.parentElement.parentElement) {
        const strip = active.parentElement.parentElement;
        if (strip.scrollWidth > strip.clientWidth) {
          strip.scrollTo({
            left: active.offsetLeft - (strip.clientWidth - active.clientWidth) / 2,
            behavior: prefersReducedMotion() ? 'auto' : 'smooth',
          });
        }
      }
    }

    /* A gallery of one has nowhere to navigate to. This used to be an early return; it is a guard
       now, because syncVideo() has to run for the single-media case too and nothing may sit
       between it and the end of this function. */
    if (slides.length > 1) {
      thumbs.forEach((thumb, n) => thumb.addEventListener('click', () => show(n)));
      if (prev) prev.addEventListener('click', () => show(index - 1));
      if (next) next.addEventListener('click', () => show(index + 1));
    }

    /* The zoom lightbox announcing which photo the buyer left it on. Open the lightbox on photo 1,
       page through to photo 4, close it — and photo 4 is what is behind it. Without this the gallery
       would still be sitting on photo 1 and the close would look like it had undone the browsing.

       It arrives as an event because show() is a closure in here and the lightbox is a different
       IIFE: there is no name it could call. The event carries the index into product.media, which is
       the same number both sides count in.

       OUTSIDE the navigation guard above. The lightbox pauses this gallery's video while it is open
       and leans on this event to start it again on the way out — and a product whose only media is
       that video is a gallery of one, with no thumb and no arrow, which the guard would have shut
       out. show(0) on a single slide is a no-op apart from exactly that restart. */
    root.addEventListener('dev-main-product:zoom-select', (event) => {
      const to = event.detail ? event.detail.index : null;
      if (typeof to === 'number' && to >= 0) show(to);
    });

    /* Start whatever is already on screen. The markup marks slide 0 active server-side, so show()
       never runs for it — without this a product whose first media is a video would sit on a poster
       forever, and there is no play button to rescue it.

       DEAD LAST on purpose. This line touches the media element, which is the one thing in here
       that can throw for reasons that have nothing to do with us — a codec the browser will not
       open, a seek it refuses. Run it before the listeners above and any such throw takes the
       whole gallery with it: no thumb click, no arrow, and a slider that looks empty. Run it last
       and the worst case is a video that does not start, with navigation still working. */
    syncVideo();
  }

  /* ---- Thumbnail scroll indicator --------------------------------------- */

  /* The mobile strip hides the native scrollbar, so this draws the one the artboard specifies
     (44948:821): a bar whose WIDTH is the fraction of the strip currently visible and whose OFFSET
     is how far through it the buyer is. Both are measured off the element actually being scrolled,
     so it stays truthful for any number of photos — the artboard's fixed 17.8% is one product's
     media count frozen into a drawing, not a value to reproduce.

     Runs on every breakpoint; the CSS only paints it below 769px. Cheaper than teaching the JS
     about the breakpoint, and it means a desktop window dragged narrow is already correct. */
  function initThumbScroll(root) {
    const strip = root.querySelector('.dev-main-product__thumbs');
    const rail = root.querySelector('[data-thumb-scroll]');
    const bar = rail ? rail.querySelector('[data-thumb-scroll-bar]') : null;

    if (!strip || !rail || !bar) return;

    let queued = false;

    function update() {
      queued = false;

      const overflow = strip.scrollWidth - strip.clientWidth;

      /* Not `> 0`: sub-pixel layout rounding leaves a fraction of a pixel of phantom overflow on
         strips that genuinely fit, and that would show a full-width bar advertising a scroll the
         buyer cannot perform. */
      if (overflow <= 1) {
        rail.hidden = true;
        return;
      }

      rail.hidden = false;

      const visible = strip.clientWidth / strip.scrollWidth;
      const progress = ratio(strip.scrollLeft / overflow);

      /* translateX percentages resolve against the BAR's own width, not the track's — so the full
         journey is (track - bar) / bar, which reduces to 1/visible - 1. Getting this wrong is the
         classic way a scroll indicator stops short of, or overshoots, the right-hand end. */
      bar.style.width = visible * 100 + '%';
      bar.style.transform = 'translateX(' + progress * (1 / visible - 1) * 100 + '%)';
    }

    function schedule() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(update);
    }

    strip.addEventListener('scroll', schedule, { passive: true });

    /* Catches the viewport changing AND the strip being resized by anything else — including the
       breakpoint flip, where the strip goes from a column that cannot scroll to a row that can. */
    if ('ResizeObserver' in window) {
      new ResizeObserver(schedule).observe(strip);
    } else {
      window.addEventListener('resize', schedule);
    }

    update();
  }

  /* Guards the division: an empty strip gives 0/0, and a rubber-band overscroll on iOS reports a
     scrollLeft past the end. Either would be written straight into a transform. */
  function ratio(value) {
    if (!isFinite(value) || value < 0) return 0;
    return value > 1 ? 1 : value;
  }

  /* ---- Variants --------------------------------------------------------- */

  function initVariants(root) {
    const data = root.querySelector('[data-variants]');
    const idField = root.querySelector('[data-variant-id]');
    const cta = root.querySelector('[data-add]');
    const priceEl = root.querySelector('[data-cta-price]');
    const labelEl = root.querySelector('[data-cta-label]');
    const groups = Array.from(root.querySelectorAll('[data-option-index]'));

    if (!data || !idField || !cta || groups.length === 0) return;

    let variants;
    try {
      variants = JSON.parse(data.textContent);
    } catch (e) {
      // A broken variant table means we cannot know what is purchasable. Leave the server-rendered
      // form exactly as it is rather than wiring up chips that would post the wrong variant.
      return;
    }

    const addLabel = labelEl ? labelEl.dataset.addLabel : '';
    const soldOutLabel = labelEl ? labelEl.dataset.soldOutLabel : '';

    function selection() {
      return groups.map((group) => {
        const checked = group.querySelector('[data-option-input]:checked');
        return checked ? checked.value : null;
      });
    }

    function findVariant(options) {
      return variants.find((variant) =>
        options.every((value, i) => value === null || variant.options[i] === value)
      );
    }

    // Grey out a chip whose combination Shopify has no variant for, or has none in stock. Done
    // against the variant table, not by guessing from the chips: only the table knows which
    // combinations actually exist.
    function markAvailability() {
      const chosen = selection();

      groups.forEach((group, groupIndex) => {
        group.querySelectorAll('[data-option-input]').forEach((input) => {
          const probe = chosen.slice();
          probe[groupIndex] = input.value;

          const match = variants.find((variant) =>
            probe.every((value, i) => value === null || variant.options[i] === value)
          );

          const label = input.nextElementSibling;
          if (!label) return;
          const unavailable = !match || !match.available;
          label.classList.toggle('dev-main-product__chip--unavailable', unavailable);

          // The unavailable state is drawn with opacity: 0.4, which takes the label text down to
          // a 1.8:1 contrast ratio — a colour-contrast failure on every sold-out chip. WCAG 1.4.3
          // exempts inactive controls, but nothing in the markup said these were inactive, so the
          // audit judged them as live text. aria-disabled states it, and unlike the `disabled`
          // attribute it leaves the chip focusable, so a keyboard user can still reach a sold-out
          // option and hear that it is unavailable rather than have it vanish from the tab order.
          if (unavailable) {
            input.setAttribute('aria-disabled', 'true');
          } else {
            input.removeAttribute('aria-disabled');
          }
        });
      });
    }

    function update() {
      const chosen = selection();
      const variant = findVariant(chosen);

      groups.forEach((group) => {
        const checked = group.querySelector('[data-option-input]:checked');
        const out = group.querySelector('[data-selected-value]');
        if (checked && out) out.textContent = checked.value;
      });

      markAvailability();

      if (!variant) {
        cta.disabled = true;
        if (labelEl) labelEl.textContent = soldOutLabel;
        return;
      }

      idField.value = variant.id;
      cta.disabled = !variant.available;
      if (priceEl) priceEl.textContent = variant.price;
      if (labelEl) labelEl.textContent = variant.available ? addLabel : soldOutLabel;

      // Keep the URL in step, so a shared or reloaded link lands on the variant the buyer chose.
      const url = new URL(window.location.href);
      url.searchParams.set('variant', variant.id);
      window.history.replaceState({}, '', url);
    }

    root.querySelectorAll('[data-option-input]').forEach((input) => {
      input.addEventListener('change', update);
    });

    markAvailability();
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
})();

/* ---- Overlays: guide drawers, unit toggle, zoom lightbox ----------------- */
(function () {
  const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-main-product]').forEach((root) => {
      initGuides(root);
      initUnits(root);
      initZoom(root);
    });
  });

  // The theme editor re-renders a section without a fresh DOMContentLoaded. Only the zoom is re-run:
  // it carries an idempotency guard, and the editor hands us a brand-new DOM every time.
  document.addEventListener('shopify:section:load', (event) => {
    event.target.querySelectorAll('[data-main-product]').forEach((root) => initZoom(root));
  });

  function initGuides(root) {
    const guides = Array.from(root.querySelectorAll('[data-guide]'));
    if (guides.length === 0) return;

    let lastTrigger = null;

    function open(guide, trigger) {
      guide.removeAttribute('inert');
      guide.removeAttribute('aria-hidden');

      guide.dataset.open = 'true';

      lastTrigger = trigger || null;
      if (trigger) trigger.setAttribute('aria-expanded', 'true');

      lockScroll();

      // THE fix for the jerky open. Focusing a control inside the panel — which at this instant is
      // still translated a full panel-width off-screen — makes the browser scroll it into view. It
      // scrolls the overflow:hidden container, the drawer lands in place with no animation at all,
      // and the transform then runs from an already-visible position. So: focus the panel itself,
      // and forbid the scroll. Tab from there still walks into the close button.
      const panel = guide.querySelector('[data-guide-panel]');
      const target = panel || guide;
      target.focus({ preventScroll: true });

      // Belt and braces: any scroll a previous open leaked into the container would offset the
      // panel for the whole of this animation.
      guide.scrollLeft = 0;
      guide.scrollTop = 0;
    }

    function close(guide) {
      guide.dataset.open = 'false';
      guide.setAttribute('aria-hidden', 'true');

      unlockScroll();

      // Focus leaves BEFORE inert goes on, or the browser is left with focus inside an inert subtree.
      if (lastTrigger) {
        lastTrigger.setAttribute('aria-expanded', 'false');
        lastTrigger.focus({ preventScroll: true });
      }
      guide.setAttribute('inert', '');
    }

    root.querySelectorAll('[data-guide-open]').forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const guide = root.querySelector('[data-guide="' + trigger.dataset.guideOpen + '"]');
        if (guide) open(guide, trigger);
      });
    });

    guides.forEach((guide) => {
      guide.addEventListener('click', (event) => {
        if (event.target.closest('[data-guide-close]')) close(guide);

        // "Chat with us" in a guide's footer opens the store's live chat — the
        // Shopify Inbox app embed's <shopify-chat> element, whose public show()
        // method opens the panel. Merchant-controlled twice over: the section
        // setting (data-guide-chat on the root) turns the behaviour off
        // entirely, and the footer is richtext, so only a link whose sentence
        // mentions "chat" is hijacked — and only while the widget is actually
        // on the page; otherwise the link keeps its own href (/pages/contact)
        // as the no-widget fallback.
        if (!root.hasAttribute('data-guide-chat')) return;
        const footLink = event.target.closest('.dev-main-product__guide-foot a');
        if (footLink && /chat/i.test((footLink.closest('p') || footLink).textContent)) {
          const chat = document.querySelector('shopify-chat');
          if (chat && typeof chat.show === 'function') {
            event.preventDefault();
            close(guide);
            chat.show();
          }
        }
      });

      guide.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          close(guide);
          return;
        }
        if (event.key !== 'Tab') return;

        // Trap the tab ring. A modal you can tab out of is a modal that lies about being one.
        const items = Array.from(guide.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];

        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
    });
  }

  function initUnits(root) {
    const buttons = Array.from(root.querySelectorAll('[data-unit]'));
    if (buttons.length === 0) return;

    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const unit = button.dataset.unit;

        buttons.forEach((other) => {
          const on = other === button;
          other.classList.toggle('dev-main-product__unit--active', on);
          other.setAttribute('aria-pressed', String(on));
        });

        // Both values were rendered server-side; the switch only chooses which one is shown.
        root.querySelectorAll('[data-unit-value]').forEach((value) => {
          value.hidden = value.dataset.unitValue !== unit;
        });
      });
    });
  }

  /* ---- Zoom lightbox -----------------------------------------------------

     Horizon ships this feature, and none of it can be reused: zoom-dialog and drag-zoom-wrapper are
     ES-module custom elements that import from the @theme/* importmap and reach for a <media-gallery>
     ancestor to talk to. What follows is the technique, not the code — a native <dialog>, the 3840
     source held in reserve for the gesture, and the pinch/pan maths, rewritten in this file's idiom.

     The gesture engine is a port of assets/drag-zoom-wrapper.js. Two things there are load-bearing
     and easy to lose: the transform is scale() THEN translate(), so every translate is in pre-scale
     units and has to be divided by the scale; and a pinch has to move the photo so the point between
     the fingers stays put, or it crawls away from under them. */

  const ZOOM_MIN = 1;
  const ZOOM_MAX = 5;
  const ZOOM_TAP = 1.5; // where a double-tap lands, as in stock
  const TAP_DELAY = 300; // two taps closer together in time than this...
  const TAP_DISTANCE = 50; // ...and closer in space than this, are one double-tap
  const DRAG_THRESHOLD = 10; // a finger that has not travelled this far is still holding still
  const SWIPE_THRESHOLD = 40; // ...and one that has travelled this far sideways is changing photo

  function initZoom(root) {
    const dialog = root.querySelector('[data-zoom-dialog]');
    if (!dialog) return;

    // No showModal, no top layer, no focus trap — everything below assumes all three. The gallery
    // underneath is untouched and still works; the photo simply does not open.
    if (typeof dialog.showModal !== 'function') return;
    if (root.dataset.zoomReady === 'true') return;

    const frame = dialog.querySelector('[data-zoom-frame]');
    const triggers = Array.from(root.querySelectorAll('[data-zoom-open]'));
    const slides = Array.from(dialog.querySelectorAll('[data-zoom-slide]'));
    if (!frame || triggers.length === 0 || slides.length === 0) return;

    root.dataset.zoomReady = 'true';

    const counter = dialog.querySelector('[data-zoom-counter]');
    const status = dialog.querySelector('[data-zoom-status]');
    const closeButton = dialog.querySelector('[data-zoom-close]');
    const prevButton = dialog.querySelector('[data-zoom-prev]');
    const nextButton = dialog.querySelector('[data-zoom-next]');

    let index = 0;
    let lastTrigger = null;
    let openedViaKeyboard = false;

    // Gesture state. `scale` and `translate` are the transform; the `start*` values freeze the state
    // a gesture began from, so every move is computed from the finger's total travel rather than
    // accumulated frame by frame — accumulation drifts.
    let scale = ZOOM_MIN;
    let translate = { x: 0, y: 0 };
    let startDistance = 0;
    let startScale = ZOOM_MIN;
    let startTranslate = { x: 0, y: 0 };
    let startPoint = { x: 0, y: 0 };
    let dragging = false;
    let panned = false;
    let lastTapTime = 0;
    let lastTapPoint = { x: 0, y: 0 };

    /* ---- The photo on show ---- */

    function activeImage() {
      const slide = slides[index];
      return slide ? slide.querySelector('.dev-main-product__zoom-image') : null;
    }

    /* The video slides. Everything above this line is written for a photo — activeImage() returns
       null on a video slide, so the pinch, the pan and the 3840 upgrade all bail out on their own
       and none of them needed a special case. Playback is the one thing that did.

       `play` false stops every clip, which is what closing needs; the argument exists so cleanup()
       does not have to fake an index nobody is on. */
    function syncZoomVideo(play) {
      slides.forEach((slide, n) => {
        slide.querySelectorAll('video').forEach((video) => {
          if (!play || n !== index) {
            video.pause();
            if (video.readyState > 0) video.currentTime = 0;
            return;
          }
          const started = video.play();
          if (started && typeof started.catch === 'function') started.catch(() => {});
        });
      });
    }

    function show(i) {
      index = (i + slides.length) % slides.length;

      // A photo left at 3x would be handed to the next one, which is a different shape and would be
      // panned to somewhere that no longer exists.
      resetTransform();

      slides.forEach((slide, n) => {
        slide.classList.toggle('dev-main-product__zoom-slide--active', n === index);
      });

      upgrade(slides[index]);
      syncZoomVideo(true);

      if (counter) counter.textContent = index + 1 + ' / ' + slides.length;
      // The counter reads "1 slash 7", which is not a sentence. The live region carries the same fact
      // as one — rendered server-side, so it is translated.
      if (status) status.textContent = slides[index].dataset.zoomLabel || '';
    }

    /* The 3840 file, fetched only once the photo is actually on screen. This is not about fitting the
       viewport — the srcset already chose a candidate for that. It is the resolution the pinch needs
       in reserve: scaling is a CSS transform, and a transform never makes the browser go and fetch a
       bigger candidate. Without this, 5x is a 2048 image blown up and blurry. */
    function upgrade(slide) {
      if (!slide || slide.dataset.zoomUpgraded === 'true') return;

      const image = slide.querySelector('.dev-main-product__zoom-image');
      const url = slide.dataset.maxRes;
      if (!image || !url) return;

      slide.dataset.zoomUpgraded = 'true';

      const probe = new Image();

      probe.addEventListener('load', () => {
        // Swapped only once the file is decoded and in cache, so the photo never blinks through a
        // half-painted state. srcset comes off first or it goes on out-voting src.
        image.removeAttribute('srcset');
        image.removeAttribute('sizes');
        image.src = url;
      });

      probe.addEventListener('error', () => {
        // The 2048 already on screen is a perfectly good photo. Let it be, and let a later open try
        // again rather than marking this slide permanently done.
        delete slide.dataset.zoomUpgraded;
      });

      probe.src = url;
    }

    /* ---- The transform ---- */

    function applyTransform() {
      const image = activeImage();
      if (!image) return;

      image.style.setProperty('--zoom-scale', String(scale));
      image.style.setProperty('--zoom-x', translate.x + 'px');
      image.style.setProperty('--zoom-y', translate.y + 'px');

      frame.dataset.zoomed = scale > ZOOM_MIN ? 'true' : 'false';
    }

    function resetTransform() {
      scale = ZOOM_MIN;
      translate = { x: 0, y: 0 };

      // Cleared off every slide, not just the active one: the vars are inline styles and would
      // otherwise sit on a photo we paged away from, waiting to reappear with it.
      slides.forEach((slide) => {
        const image = slide.querySelector('.dev-main-product__zoom-image');
        if (!image) return;
        image.style.removeProperty('--zoom-scale');
        image.style.removeProperty('--zoom-x');
        image.style.removeProperty('--zoom-y');
      });

      frame.dataset.zoomed = 'false';
    }

    function constrain() {
      scale = clamp(scale, ZOOM_MIN, ZOOM_MAX);

      // At 1x the whole photo is on screen. There is nowhere to pan to, and letting a translate
      // survive here would leave it hanging off-centre.
      if (scale <= ZOOM_MIN) {
        translate = { x: 0, y: 0 };
        return;
      }

      const image = activeImage();
      if (!image) return;

      // The <img> box IS the photo: it is capped with max-width/max-height rather than stretched to
      // the frame with object-fit, so there are no letterbox bands inside the element to measure
      // around. That is the whole reason for sizing it that way — stock has to reconstruct the
      // contain geometry from naturalWidth/naturalHeight to find the same numbers.
      const bounds = frameRect();
      const overflowX = Math.max(0, image.clientWidth * scale - bounds.width);
      const overflowY = Math.max(0, image.clientHeight * scale - bounds.height);

      // Half the overflow, because the photo starts centred — and then divided by the scale, because
      // translate runs after scale and is multiplied by it.
      const maxX = overflowX / 2 / scale;
      const maxY = overflowY / 2 / scale;

      translate.x = clamp(translate.x, -maxX, maxX);
      translate.y = clamp(translate.y, -maxY, maxY);
    }

    /* ---- Gestures (phones only, as in stock) ---- */

    /* The frame is the full-screen lightbox — its rect cannot change in the middle of a touch
       gesture, yet constrain() and centreOf() run on EVERY touchmove of a pinch or pan, and
       getBoundingClientRect there forces a synchronous layout right before the transform
       write. So the rect is measured once per gesture (touchstart) and dropped on touchend;
       outside a gesture the fallback measures fresh. */
    let gestureRect = null;

    function frameRect() {
      return gestureRect || frame.getBoundingClientRect();
    }

    function centreOf() {
      const bounds = frameRect();
      return { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
    }

    // Zoom about a point instead of about the middle of the frame: shift the photo by how far that
    // point sits from the centre, scaled by how much the scale just changed.
    function zoomAbout(px, py, previous) {
      const centre = centreOf();
      const delta = scale / previous - 1;

      translate.x -= ((px - centre.x) * delta) / scale;
      translate.y -= ((py - centre.y) * delta) / scale;
    }

    function pinch(a, b) {
      if (!startDistance) return;

      const previous = scale;
      scale = clamp((touchDistance(a, b) / startDistance) * startScale, ZOOM_MIN, ZOOM_MAX);

      zoomAbout((a.clientX + b.clientX) / 2, (a.clientY + b.clientY) / 2, previous);

      dragging = false;
      constrain();
      applyTransform();
    }

    function pan(touch) {
      const dx = touch.clientX - startPoint.x;
      const dy = touch.clientY - startPoint.y;

      // A finger resting on a photo trembles. Below the threshold it is not panning yet.
      if (!panned && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      panned = true;

      translate.x = startTranslate.x + dx / scale;
      translate.y = startTranslate.y + dy / scale;

      constrain();
      applyTransform();
    }

    function doubleTap(touch) {
      const previous = scale;

      if (Math.abs(scale - ZOOM_MIN) > 0.01) {
        // Anywhere above 1x, a double-tap means "put it back".
        resetTransform();
        return;
      }

      scale = ZOOM_TAP;
      zoomAbout(touch.clientX, touch.clientY, previous);
      constrain();
      applyTransform();
    }

    /* A touch that landed on the video belongs to the video. The gesture layer below reads a
       horizontal drag as "next slide" and two quick taps as a zoom — which is exactly what dragging
       the scrubber and tapping play look like from out here. Without this guard the buyer cannot
       seek: every attempt pages to the next photo instead. */
    function onVideo(event) {
      const target = event.target;
      return !!(target && target.closest && target.closest('.dev-main-product__zoom-video'));
    }

    if (frame) {
      frame.addEventListener(
        'touchstart',
        (event) => {
          if (!isPhone()) return;
          if (onVideo(event)) return;

          gestureRect = frame.getBoundingClientRect();

          if (event.touches.length === 2) {
            startDistance = touchDistance(event.touches[0], event.touches[1]);
            startScale = scale;
            dragging = false;
            return;
          }

          if (event.touches.length === 1) {
            startPoint = { x: event.touches[0].clientX, y: event.touches[0].clientY };
            startTranslate = { x: translate.x, y: translate.y };
            dragging = true;
            panned = false;
          }
        },
        { passive: true }
      );

      frame.addEventListener(
        'touchmove',
        (event) => {
          if (!isPhone()) return;
          if (onVideo(event)) return;

          if (event.touches.length === 2) {
            event.preventDefault();
            pinch(event.touches[0], event.touches[1]);
            return;
          }

          // Only a zoomed photo pans. At 1x the same drag is a swipe to the next photo, and stealing
          // it would leave the lightbox feeling stuck to the finger.
          if (event.touches.length === 1 && dragging && scale > ZOOM_MIN) {
            event.preventDefault();
            pan(event.touches[0]);
          }
        },
        { passive: false }
      );

      frame.addEventListener(
        'touchend',
        (event) => {
          if (!isPhone()) return;
          if (onVideo(event)) return;
          // A finger coming off a pinch leaves one still down. That is not the end of the gesture.
          if (event.touches.length > 0) return;

          const touch = event.changedTouches[0];
          dragging = false;
          if (!touch) return;

          const dx = touch.clientX - startPoint.x;
          const dy = touch.clientY - startPoint.y;

          // Sideways, far enough, and more sideways than not: the next photo. Only while unzoomed —
          // zoomed, that exact movement was a pan.
          if (scale <= ZOOM_MIN && Math.abs(dx) > SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy)) {
            show(index + (dx < 0 ? 1 : -1));
            return;
          }

          if (panned) return;

          const now = Date.now();
          const quick = now - lastTapTime < TAP_DELAY;
          const near = Math.hypot(touch.clientX - lastTapPoint.x, touch.clientY - lastTapPoint.y) < TAP_DISTANCE;

          if (quick && near) {
            doubleTap(touch);
            lastTapTime = 0; // consumed — a third tap starts a new pair, not another double
            return;
          }

          lastTapTime = now;
          lastTapPoint = { x: touch.clientX, y: touch.clientY };
        },
        { passive: true }
      );

      /* Registered AFTER the gesture touchend above, so the cached rect is still valid inside
         it (doubleTap measures through frameRect()); dropped once the last finger lifts so a
         later non-gesture caller can never see a stale rect. */
      frame.addEventListener(
        'touchend',
        (event) => {
          if (event.touches.length === 0) gestureRect = null;
        },
        { passive: true }
      );
      frame.addEventListener('touchcancel', () => { gestureRect = null; }, { passive: true });
    }

    /* ---- Open / close ---- */

    function open(event, trigger) {
      const target = Number(trigger.dataset.zoomTarget);
      const at = slides.findIndex((slide) => Number(slide.dataset.mediaIndex) === target);

      // detail 0 is a keyboard activation; a pointer click reports 1 or more. It decides where the
      // focus goes on the way out — see cleanup().
      openedViaKeyboard = !!event && event.detail === 0;
      lastTrigger = trigger;

      /* Stop the gallery's copy of the clip. The lightbox holds a second <video> on the same file,
         and leaving both running means two decoders on one stream for no one's benefit — the
         gallery is behind a modal backdrop. cleanup() starts it again through zoom-select. */
      root.querySelectorAll('video').forEach((video) => {
        if (!dialog.contains(video)) video.pause();
      });

      show(at < 0 ? 0 : at);

      dialog.showModal();
      // showModal() lands focus on the first control — the × — and iOS Safari then rings it. Focus
      // the frame instead; Tab from there still reaches the ×.
      frame.focus({ preventScroll: true });
      lockScroll();
      animateState('opening');
    }

    function close() {
      if (!dialog.open || dialog.dataset.modalState === 'closing') return;

      animateState('closing', () => {
        dialog.close();
        // Called here, on the way out, rather than left to the dialog's `close` event: that event was
        // measured not firing in this theme, which left the page scroll-locked. `close` is still
        // listened for below, but only as a belt. This is the braces.
        cleanup();
      });
    }

    // Idempotent on purpose — it runs again if the `close` event does fire.
    function cleanup() {
      unlockScroll();
      delete dialog.dataset.modalState;
      resetTransform();
      // Before the dispatch below, or the clip carries on playing with the modal gone — and if the
      // buyer had unmuted it, audibly.
      syncZoomVideo(false);

      const slide = slides[index];
      const media = slide ? Number(slide.dataset.mediaIndex) : -1;

      // Tell the gallery first, THEN move the focus. Focus has to land on the trigger of the photo
      // the buyer actually ends on, and that trigger is inside a slide that is still
      // visibility:hidden until the gallery catches up — focusing it now would silently do nothing.
      if (media >= 0) {
        root.dispatchEvent(new CustomEvent('dev-main-product:zoom-select', { detail: { index: media } }));
      }

      const back = triggers.find((trigger) => Number(trigger.dataset.zoomTarget) === media) || lastTrigger;
      if (!back) return;

      // Hand the focus back only to a keyboard user. After a tap, Safari treats a restored focus as
      // focus-visible and paints a ring on a button nobody is looking at.
      if (openedViaKeyboard) {
        back.focus();
      } else if (document.activeElement === back) {
        back.blur();
      }
    }

    /* Drive the CSS animation from a data attribute and wait for it to land. The timeout is not
       belt-and-braces: animationend never fires if the animation does not run — a background tab, a
       future edit that drops the keyframes — and without it the lightbox would hang open forever. */
    function animateState(state, done) {
      dialog.dataset.modalState = state;

      const ms = duration(state) + 50;
      let settled = false;

      const settle = () => {
        if (settled) return;
        settled = true;
        dialog.removeEventListener('animationend', onEnd);
        delete dialog.dataset.modalState;
        if (done) done();
      };

      const onEnd = (event) => {
        // Only the dialog's own animation counts. The photo inside runs one too and it lands first;
        // acting on that would cut the fade off half way.
        if (event.target === dialog) settle();
      };

      dialog.addEventListener('animationend', onEnd);
      window.setTimeout(settle, ms);
    }

    // The durations live in the section's token block so the motion here and the keyframes in the CSS
    // cannot drift apart. A media query cannot reach those tokens, so reduced motion is answered here
    // as well as in the stylesheet.
    function duration(state) {
      if (prefersReducedMotion()) return 0;
      const prop = state === 'closing' ? '--zoom-out' : '--zoom-in';
      return parseFloat(window.getComputedStyle(dialog).getPropertyValue(prop)) || 300;
    }

    triggers.forEach((trigger) => {
      trigger.addEventListener('click', (event) => open(event, trigger));
    });

    if (closeButton) closeButton.addEventListener('click', close);
    if (prevButton) prevButton.addEventListener('click', () => show(index - 1));
    if (nextButton) nextButton.addEventListener('click', () => show(index + 1));

    /* Escape. <dialog> handles the key itself and closes INSTANTLY, which would snatch the lightbox
       off the screen with no exit animation. Take the default over and run the same close as the
       button, so every route out looks the same. */
    dialog.addEventListener('cancel', (event) => {
      event.preventDefault();
      close();
    });

    /* Anything that is not the photo and not a control: the dialog's own box, the frame, the space
       beside a portrait photo. The photo is exempt on purpose — on a phone it is the pinch surface,
       and the two clicks of a double-tap must not be read as "close". The nav is exempt as a whole
       and not just its buttons, or the 4px of padding around them would be a hidden close button.

       The video is exempt for a blunter reason: its controls are inside it. Without this line the
       first press on play, on the scrubber or on the volume would close the lightbox instead, which
       would make putting the video in here pointless. */
    const KEEP_OPEN =
      '.dev-main-product__zoom-image, .dev-main-product__zoom-video, .dev-main-product__zoom-nav, [data-zoom-close]';

    dialog.addEventListener('click', (event) => {
      if (event.target.closest(KEEP_OPEN)) return;
      close();
    });

    dialog.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        show(index - 1);
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        show(index + 1);
      }
    });

    // The belt to close()'s braces: whatever route ever shuts this dialog, the page comes back
    // unlocked. Not relied upon — see the note in close().
    dialog.addEventListener('close', cleanup);
  }

  /* ---- Shared helpers ------------------------------------------------------ */

  /* The page behind an open drawer must not scroll — a modal whose backdrop scrolls under the finger
     is the other half of "it feels cheap". Removing the scrollbar reflows the page by its width,
     which would shove the whole layout sideways at the exact moment the drawer slides in, so the
     width is paid back as padding.

     Hoisted out of initGuides so the drawers and the lightbox share ONE owner of the flag. Two copies
     of this, each with its own sentinel, is how a page ends up locked with nothing open. */
  function lockScroll() {
    const body = document.body;
    if (body.dataset.mainProductLock === 'true') return;

    const gap = window.innerWidth - document.documentElement.clientWidth;
    body.dataset.mainProductLock = 'true';
    body.dataset.mainProductOverflow = body.style.overflow;
    body.dataset.mainProductPadding = body.style.paddingRight;
    body.style.overflow = 'hidden';
    if (gap > 0) body.style.paddingRight = gap + 'px';
  }

  function unlockScroll() {
    const body = document.body;
    if (body.dataset.mainProductLock !== 'true') return;

    body.style.overflow = body.dataset.mainProductOverflow || '';
    body.style.paddingRight = body.dataset.mainProductPadding || '';
    delete body.dataset.mainProductLock;
    delete body.dataset.mainProductOverflow;
    delete body.dataset.mainProductPadding;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function touchDistance(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  // The same 768 the stylesheet uses, and the same gate stock puts on its own pinch engine: a mouse
  // has arrows and a keyboard, and no pinch to give.
  function isPhone() {
    return window.matchMedia('(max-width: 768px)').matches;
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
})();

/* ---- Accordions ---------------------------------------------------------- */
(function () {
  // Height is animated with the Web Animations API rather than a CSS transition, because there is
  // nothing to transition BETWEEN: <details> has no intermediate height. It is `auto` or it is the
  // summary, and `auto` is not an animatable value. So each open measures the real end height and
  // animates to it in pixels, then hands the element back to `auto` — a row whose content reflows
  // (a font landing, an image loading) is never left frozen at a stale pixel height.
  const running = new WeakMap();

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-main-product]').forEach((root) => initAccordions(root));
  });

  function initAccordions(root) {
    root.querySelectorAll('[data-acc-group]').forEach((group) => {
      const items = Array.from(group.querySelectorAll('[data-acc]'));
      if (items.length === 0) return;

      items.forEach((details) => {
        const summary = details.querySelector('summary');
        if (!summary) return;

        summary.addEventListener('click', (event) => {
          // The browser's own toggle is instant and unstoppable. Take it over: we open and close.
          event.preventDefault();

          if (isOpen(details)) {
            collapse(details);
            return;
          }

          // One row at a time. Whatever is open closes on the way — collapsed with the same
          // animation as a click on its own summary, not slammed shut.
          items.forEach((other) => {
            if (other !== details && isOpen(other)) collapse(other);
          });

          expand(details);
        });
      });
    });
  }

  // A row that is mid-collapse still carries `open` — the content has to stay in the DOM to be
  // animated out of. Reading `.open` alone would call a click on a closing row "close it again",
  // and the row would never come back. What the user sees is what counts: a closing row is closed.
  function isOpen(details) {
    return details.open && details.dataset.accState !== 'closing';
  }

  function expand(details) {
    const from = current(details);
    stop(details);

    details.open = true;
    details.dataset.accState = 'opening';

    // Read the natural height while nothing is pinning it. This is the only honest measurement:
    // scrollHeight excludes the border, and the row is border-box.
    const to = details.getBoundingClientRect().height;

    animate(details, from, to, () => {
      delete details.dataset.accState;
    });
  }

  function collapse(details) {
    const from = current(details);
    stop(details);

    details.dataset.accState = 'closing';

    animate(details, from, closedHeight(details), () => {
      // .open comes off only at the END. It is what keeps the content in the DOM to be animated out
      // of — drop it up front and the row would vanish and then politely animate an empty box.
      details.open = false;
      delete details.dataset.accState;
    });
  }

  function animate(details, from, to, done) {
    // overflow: hidden is what does the clipping while the box is shorter than its content. It is
    // set inline and cleared on landing, so the open row can still overflow naturally if it must.
    details.style.overflow = 'hidden';

    const anim = details.animate({ height: [from + 'px', to + 'px'] }, { duration: duration(details), easing: easing(details) });

    running.set(details, anim);

    anim.addEventListener('finish', () => {
      running.delete(details);
      details.style.overflow = '';
      details.style.height = '';
      done();
    });
  }

  // Cancel any animation still in flight, having already read the height it had reached. Without
  // this, a fast second click animates from the row's resting height and the panel visibly snaps
  // back before it starts moving.
  function stop(details) {
    const anim = running.get(details);
    if (!anim) return;
    anim.cancel();
    running.delete(details);
  }

  function current(details) {
    return details.getBoundingClientRect().height;
  }

  // The row at rest: summary, plus the row's own padding and borders. Everything else is content.
  function closedHeight(details) {
    const summary = details.querySelector('summary');
    const styles = window.getComputedStyle(details);

    return (
      summary.getBoundingClientRect().height +
      parseFloat(styles.paddingTop) +
      parseFloat(styles.paddingBottom) +
      parseFloat(styles.borderTopWidth) +
      parseFloat(styles.borderBottomWidth)
    );
  }

  // The duration and the curve live in the section's token block, so the height animation here and
  // the content fade in the CSS cannot drift apart.
  function duration(details) {
    if (prefersReducedMotion()) return 0;
    return parseFloat(window.getComputedStyle(details).getPropertyValue('--acc-dur')) || 300;
  }

  // The same curve opening and closing. A row that closes on a different curve from the row opening
  // beside it makes the pair look like they are arguing.
  function easing(details) {
    return window.getComputedStyle(details).getPropertyValue('--acc-ease').trim() || 'ease';
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
})();

/* ---- Add to cart --------------------------------------------------------- */
(function () {
  /* Adding a duvet should open the basket, not throw the buyer onto /cart and make them find
     their way back to the product they were still comparing.

     The form still works with JS off: it is a real <form action="/cart/add">, and the native POST
     still adds the item and lands on the cart page. Everything below is an upgrade on top of that,
     never a replacement for it — so the buy button can never become a button that does nothing. */
  const DRAWER_SELECTOR = 'div.cart-drawer';

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-main-product]').forEach((root) => initAddToCart(root));
  });

  function initAddToCart(root) {
    const form = root.querySelector('.dev-main-product__form');
    const button = root.querySelector('[data-add]');
    const error = root.querySelector('[data-cta-error]');
    if (!form || !button) return;

    // No drawer on this page? Leave the form entirely alone. Hijacking the submit and then having
    // nowhere to show the result is strictly worse than the plain page load we started with.
    if (!document.querySelector(DRAWER_SELECTOR)) return;

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (button.disabled) return;

      hideError(error);
      busy(button, true);

      try {
        const response = await fetch(root.dataset.cartAddUrl, {
          method: 'POST',
          headers: { Accept: 'application/json' },
          body: new FormData(form),
        });

        if (!response.ok) {
          // A rejected add is a real answer, not a failure of the mechanism — show Shopify's own
          // reason and stay on the page. Falling back to a native submit here would just replay
          // the same rejection as a full page load.
          const body = await response.json().catch(() => ({}));
          showError(error, body.description || body.message);
          return;
        }

        await refresh(root);
        openDrawer();
      } catch (e) {
        // The request never completed — the network, not the cart, said no. Hand the buyer back to
        // the form that works without any of this.
        form.submit();
      } finally {
        busy(button, false);
      }
    });
  }

  /* The drawer is rendered by a BLOCK of the header, and Shopify's Section Rendering API does not
     render `content_for 'blocks'` — ?sections=dev-site-header comes back with the cart button and
     no drawer at all. So the fresh markup is pulled from a real page render instead. The cart page
     is the cheapest one that carries the header, and asking the cart for the cart is honest. */
  async function refresh(root) {
    const response = await fetch(root.dataset.cartUrl, { headers: { Accept: 'text/html' } });
    if (!response.ok) return;

    const doc = new DOMParser().parseFromString(await response.text(), 'text/html');

    // div.cart-drawer, NOT #cart-drawer: Horizon's stock <theme-drawer> claims the same id on the
    // same page, so an id lookup is a coin toss decided by document order.
    const fresh = doc.querySelector(DRAWER_SELECTOR);
    const live = document.querySelector(DRAWER_SELECTOR);
    if (fresh && live) {
      /* Content AND footer — the footer carries the checkout button, which the drawer renders only
         when the basket has contents. This add is precisely the moment that flips: the buyer landed
         with an empty basket (every first visit), so the footer came down WITHOUT a checkout button
         and swapping the content alone left it that way — drawer open, duvet in it, nothing to
         click. Keep the two regions in step with the server's own render.

         The drawer's listeners sit on its ROOT and are delegated, so replacing what is inside it
         cannot unbind the close button, the backdrop or the focus trap. */
      ['.cart-drawer__content', '.cart-drawer__footer'].forEach((selector) => {
        const next = fresh.querySelector(selector);
        const current = live.querySelector(selector);
        if (next && current) current.replaceWith(next);
      });
    }

    const toggle = document.querySelector('.site-header__cart-toggle');
    const freshToggle = doc.querySelector('.site-header__cart-toggle');
    if (toggle && freshToggle) {
      // The count badge only exists once the cart is non-empty, so the whole inside is swapped
      // rather than a number written into an element that may not be there yet. The element itself
      // survives — the header's click handler is delegated from the section, but aria-controls and
      // aria-expanded live on this node and must not be rebuilt out from under it.
      toggle.innerHTML = freshToggle.innerHTML;
      toggle.setAttribute('aria-label', freshToggle.getAttribute('aria-label') || '');
    }
  }

  /* Open it the way the header does, not by reaching into the drawer's internals: write the state
     onto the trigger, then announce it. The drawer reads the trigger's aria-expanded to decide
     which way to go, so setting one without the other leaves the cart button one click out of step
     — the next click would "close" an already-closed drawer and look dead. */
  function openDrawer() {
    const trigger = document.querySelector('[aria-controls="cart-drawer"]');

    if (trigger) {
      trigger.setAttribute('aria-expanded', 'true');
      document.dispatchEvent(new CustomEvent('site-header:cart-toggle'));
      return;
    }

    // No trigger (a header without the cart button): the drawer derives everything from [data-open].
    const drawer = document.querySelector(DRAWER_SELECTOR);
    if (drawer) drawer.dataset.open = 'true';
  }

  function busy(button, on) {
    button.disabled = on;
    button.setAttribute('aria-busy', String(on));
  }

  function showError(el, message) {
    if (!el) return;
    el.textContent = message || '';
    el.hidden = !message;
  }

  function hideError(el) {
    if (!el) return;
    el.textContent = '';
    el.hidden = true;
  }
})();
