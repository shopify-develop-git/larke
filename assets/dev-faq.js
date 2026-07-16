/* FAQ accordion. Duplicated from dev-main-product.js on purpose — see the note in dev-faq.liquid. */
(function () {
  // Height is animated with the Web Animations API rather than a CSS transition, because there is
  // nothing to transition BETWEEN: <details> has no intermediate height. It is `auto` or it is the
  // summary, and `auto` is not an animatable value. So each open measures the real end height and
  // animates to it in pixels, then hands the element back to `auto` — a row whose content reflows
  // (a font landing, an image loading) is never left frozen at a stale pixel height.
  const running = new WeakMap();

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-faq]').forEach((root) => init(root));
  });

  function init(root) {
    root.querySelectorAll('[data-faq-group]').forEach((group) => {
      const items = Array.from(group.querySelectorAll('[data-faq-item]'));
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
    return details.open && details.dataset.faqState !== 'closing';
  }

  function expand(details) {
    const from = current(details);
    stop(details);

    details.open = true;
    details.dataset.faqState = 'opening';

    // Read the natural height while nothing is pinning it. This is the only honest measurement:
    // scrollHeight excludes the border, and the row is border-box.
    const to = details.getBoundingClientRect().height;

    animate(details, from, to, () => {
      delete details.dataset.faqState;
    });
  }

  function collapse(details) {
    const from = current(details);
    stop(details);

    details.dataset.faqState = 'closing';

    animate(details, from, closedHeight(details), () => {
      // .open comes off only at the END. It is what keeps the content in the DOM to be animated out
      // of — drop it up front and the row would vanish and then politely animate an empty box.
      details.open = false;
      delete details.dataset.faqState;
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
