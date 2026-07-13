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
