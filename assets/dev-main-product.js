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
  }

  /* ---- Gallery ---------------------------------------------------------- */

  function initGallery(root) {
    const slides = Array.from(root.querySelectorAll('[data-slide]'));
    const thumbs = Array.from(root.querySelectorAll('[data-thumb]'));
    const prev = root.querySelector('[data-prev]');
    const next = root.querySelector('[data-next]');

    if (slides.length < 2) return;

    let index = 0;

    function show(i) {
      // Wrap around: the artboard draws no disabled arrow, so there is no end to hit.
      index = (i + slides.length) % slides.length;

      slides.forEach((slide, n) => {
        slide.classList.toggle('dev-main-product__slide--active', n === index);
      });

      thumbs.forEach((thumb, n) => {
        const on = n === index;
        thumb.classList.toggle('dev-main-product__thumb--active', on);
        thumb.setAttribute('aria-current', String(on));
      });

      // Pause a video we are scrolling away from. Leaving it playing behind a hidden slide is
      // how a product page ends up with audio coming from nowhere.
      slides.forEach((slide, n) => {
        if (n === index) return;
        slide.querySelectorAll('video').forEach((video) => video.pause());
      });

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

    thumbs.forEach((thumb, n) => thumb.addEventListener('click', () => show(n)));
    if (prev) prev.addEventListener('click', () => show(index - 1));
    if (next) next.addEventListener('click', () => show(index + 1));
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
          label.classList.toggle(
            'dev-main-product__chip--unavailable',
            !match || !match.available
          );
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

/* ---- Guide drawers + unit toggle ---------------------------------------- */
(function () {
  const FOCUSABLE = 'a[href], button:not([disabled]), input, [tabindex]:not([tabindex="-1"])';

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-main-product]').forEach((root) => {
      initGuides(root);
      initUnits(root);
    });
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

    /* The page behind an open drawer must not scroll — a modal whose backdrop scrolls under the
       finger is the other half of "it feels cheap". Removing the scrollbar reflows the page by its
       width, which would shove the whole layout sideways at the exact moment the drawer slides in,
       so the width is paid back as padding. */
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

    root.querySelectorAll('[data-guide-open]').forEach((trigger) => {
      trigger.addEventListener('click', () => {
        const guide = root.querySelector('[data-guide="' + trigger.dataset.guideOpen + '"]');
        if (guide) open(guide, trigger);
      });
    });

    guides.forEach((guide) => {
      guide.addEventListener('click', (event) => {
        if (event.target.closest('[data-guide-close]')) close(guide);
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

    const anim = details.animate({ height: [from + 'px', to + 'px'] }, { duration: duration(details), easing: easing(details, to > from) });

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

  // The duration and the curves live in the section's token block, so the motion of the accordion
  // and the motion of the drawers cannot drift apart.
  function duration(details) {
    if (prefersReducedMotion()) return 0;
    return parseFloat(window.getComputedStyle(details).getPropertyValue('--acc-dur')) || 340;
  }

  function easing(details, opening) {
    const token = opening ? '--ease-out' : '--ease-in';
    return window.getComputedStyle(details).getPropertyValue(token).trim() || 'ease';
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
})();
