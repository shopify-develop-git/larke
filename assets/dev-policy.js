/* Policy accordion — the opt-in "Collapsible questions" mode of dev-policy. Duplicated from
   dev-faq.js (itself duplicated from dev-main-product.js) on purpose: the standard is three files
   per section, and coupling sections through a shared asset to save forty lines would cost more
   than the duplication does — see the note in dev-faq.liquid. Only the data-* hooks differ. */
(function () {
  // Height is animated with the Web Animations API rather than a CSS transition, because there is
  // nothing to transition BETWEEN: <details> has no intermediate height. It is `auto` or it is the
  // summary, and `auto` is not an animatable value. So each open measures the real end height and
  // animates to it in pixels, then hands the element back to `auto` — a row whose content reflows
  // (a font landing, an image loading) is never left frozen at a stale pixel height.
  const running = new WeakMap();

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-policy-group]').forEach((group) => init(group));
  });

  function init(group) {
    const items = Array.from(group.querySelectorAll('[data-policy-item]'));
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

        // Exclusivity is now a SETTING ("Close other rows when one opens"), not a hard-coded rule.
        // Owner, 2026-08-18: sent a screen recording of Delivery & Returns closing the previous row
        // next to FAQ leaving every row open, and asked for "the same logic as for FAQs" — i.e. the
        // independent rows they picked for the FAQ list on 2026-08-07. Defaulted OFF here to match
        // that, and left as a checkbox because the two pages had genuinely diverged and either
        // answer is defensible: comparing two delivery answers is easier with both open, while a
        // long list stays tidier with one. Flipping it is a tick in the theme editor, not a code
        // change, so this cannot need another round trip.
        //
        // The attribute is read per click rather than cached at init so toggling the setting in the
        // theme editor takes effect on the next click without a section re-render.
        if (group.hasAttribute('data-policy-single-open')) {
          // Whatever is open closes on the way — collapsed with the same animation as a click on
          // its own summary, not slammed shut.
          items.forEach((other) => {
            if (other !== details && isOpen(other)) collapse(other);
          });
        }

        expand(details);
      });
    });
  }

  // A row that is mid-collapse still carries `open` — the content has to stay in the DOM to be
  // animated out of. Reading `.open` alone would call a click on a closing row "close it again",
  // and the row would never come back. What the user sees is what counts: a closing row is closed.
  function isOpen(details) {
    return details.open && details.dataset.policyState !== 'closing';
  }

  function expand(details) {
    const from = current(details);
    stop(details);

    details.open = true;
    details.dataset.policyState = 'opening';

    // Read the natural height while nothing is pinning it. This is the only honest measurement:
    // scrollHeight excludes the border, and the row is border-box.
    const to = details.getBoundingClientRect().height;

    animate(details, from, to, () => {
      delete details.dataset.policyState;
    });
  }

  function collapse(details) {
    const from = current(details);
    stop(details);

    details.dataset.policyState = 'closing';

    animate(details, from, closedHeight(details), () => {
      // .open comes off only at the END. It is what keeps the content in the DOM to be animated out
      // of — drop it up front and the row would vanish and then politely animate an empty box.
      details.open = false;
      delete details.dataset.policyState;
    });
  }

  function animate(details, from, to, done) {
    // overflow: hidden does the clipping while the box is shorter than its content. It is set
    // inline and cleared on landing, so an open row can still overflow naturally if it must.
    details.style.overflow = 'hidden';

    const anim = details.animate(
      { height: [from + 'px', to + 'px'] },
      { duration: duration(details), easing: easing(details) }
    );

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
  // the answer's fade in the CSS cannot drift apart.
  function duration(details) {
    if (prefersReducedMotion()) return 0;
    return parseFloat(window.getComputedStyle(details).getPropertyValue('--acc-dur')) || 300;
  }

  function easing(details) {
    return window.getComputedStyle(details).getPropertyValue('--acc-ease').trim() || 'ease';
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
})();
