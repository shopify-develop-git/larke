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

          // EACH ROW IS INDEPENDENT — owner's call, 2026-08-07, matching the product page's tabs.
          // The exclusivity pass that used to sit here (collapse every other open row) is gone: on
          // an FAQ list it is actively unhelpful, because comparing two answers meant losing the
          // first one the moment you opened the second.
          //
          // 2026-08-17, asked to "make the FAQ open at the same speed as Delivery & Returns": THIS
          // is the difference, not the duration. Nothing about the timing differs — both sections
          // declare 300ms / cubic-bezier(0.32, 0.72, 0, 1) and run this same WAAPI height
          // animation (see the token block in dev-faq.liquid). But dev-policy.js still has the
          // exclusivity pass, so opening a row there plays a 300ms open AND a 300ms close at once
          // and the page settles back near its old height, while here the list only ever grows.
          // Same milliseconds, different gesture. Restoring it is a five-line insert right here —
          // `items`, `isOpen` and `collapse` are all already in scope:
          //
          //   items.forEach((other) => {
          //     if (other !== details && isOpen(other)) collapse(other);
          //   });
          //
          // NOT DONE, deliberately: it reverses the 2026-08-07 decision above and it changes
          // behaviour on every row, so it wants the owner to ask for it in as many words rather
          // than being inferred from the word "speed". Written down so the next person does not
          // go hunting through the durations again.
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
