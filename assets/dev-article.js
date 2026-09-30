/* dev-article.js
   Two jobs, both progressive — the page works fully with scripting off:

   1. The "In this article" accordion (< 1280px). A <details>, so it opens natively with no JS; this
      only adds the animated height. The animation is dev-faq.js's, duplicated on purpose (the
      standard is three files per section; see dev-faq.liquid) and trimmed to a single row.

   2. The contents rail (>= 1280px). Marks the heading currently being read with aria-current, so
      the rail shows where you are. Anchor links already jump natively; nothing to do there. */
(function () {
  const running = new WeakMap();

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-article]').forEach((root) => init(root));
  });

  function init(root) {
    root.querySelectorAll('[data-toc]').forEach((details) => initAccordion(details));

    const rail = root.querySelector('[data-toc-rail]');
    const body = root.querySelector('[data-article-body]');
    if (rail && body) initRail(rail, body);

    trackHeader(root);
  }

  /* ---------- header clearance ----------
     The site header (#header-group, dev-site-header) is sticky and slides away on scroll-down and
     back in on scroll-up. A fixed `top` for the rail cannot be right in both states: 48px sat
     UNDER the returning header (verified on the store preview, 2026-09-22). So the header's
     visible bottom edge is measured every frame it can change and written to --header-clear on
     the section root; the CSS reads it for the rail's `top` and every heading's scroll-margin.
     getBoundingClientRect includes the slide transform, so a hidden header reads as <= 0. */
  function trackHeader(root) {
    const header = document.getElementById('header-group');
    if (!header) return;

    let queued = false;
    const measure = () => {
      queued = false;
      const bottom = Math.max(0, Math.round(header.getBoundingClientRect().bottom));
      root.style.setProperty('--header-clear', bottom + 'px');
    };
    const queue = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(measure);
    };

    // Horizon scrolls .page-wrapper on desktop and the window below 990px — listen to both.
    window.addEventListener('scroll', queue, { passive: true });
    document.querySelector('.page-wrapper')?.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    header.addEventListener('transitionend', queue);
    new MutationObserver(queue).observe(header, { attributes: true, attributeFilter: ['data-header-hidden'] });
    measure();
  }

  /* ---------- 1. accordion ---------- */

  function initAccordion(details) {
    const summary = details.querySelector('summary');
    if (!summary) return;

    autoClose(details);

    summary.addEventListener('click', (event) => {
      // The browser's own toggle is instant. Take it over: we open and close.
      event.preventDefault();
      if (isOpen(details)) {
        collapse(details);
      } else {
        expand(details);
      }
    });
  }

  /* ---------- auto-close once scrolled out of view ----------
     Owner, 2026-09-28. Rules, in their words: closed by default; opens on tap; stays open during
     small or brief scrolls (either direction); closes once the WHOLE "In this article" box has
     clearly left the screen (down or up); stays closed when scrolled back to; never jumpy.

       * "whole box out of view" = IntersectionObserver with threshold 0: `isIntersecting` only goes
         false when not one pixel of the box is on screen.
       * "not on a brief scroll" = the box must STAY out of view for CLOSE_DELAY before it closes;
         scrolling straight back within that time cancels it.
       * "never jumpy" = the close is instant (it is off-screen — an animation nobody sees only costs
         time) and the reading position is pinned: the element at the reading line is measured before
         and after, and any difference is scrolled back. Chrome's own scroll anchoring usually makes
         that difference 0 already; Safari has none, and without this a closing box above the screen
         would yank the text up by the box's height.
       * It stays closed because nothing re-opens it: only a tap on the summary does. */
  const CLOSE_DELAY = 300;

  function autoClose(details) {
    if (!('IntersectionObserver' in window)) return;
    let timer = null;

    const observer = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry.isIntersecting) {
        window.clearTimeout(timer);
        timer = null;
        return;
      }
      if (!isOpen(details)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        if (isOpen(details) && !onScreen(details)) closeInPlace(details);
      }, CLOSE_DELAY);
    });

    observer.observe(details);
  }

  function onScreen(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  }

  function closeInPlace(details) {
    const anchor = readingAnchor(details);
    const before = anchor ? anchor.getBoundingClientRect().top : 0;

    stop(details);
    details.open = false;
    delete details.dataset.tocState;
    details.style.overflow = '';
    details.style.height = '';

    if (!anchor) return;
    const shift = anchor.getBoundingClientRect().top - before;
    if (Math.abs(shift) > 0.5) scrollerOf(details).scrollBy(0, shift);
  }

  // The element on the reader's line — a third of the way down the screen, clear of the sticky header.
  function readingAnchor(details) {
    const x = Math.round(window.innerWidth / 2);
    const y = Math.round(window.innerHeight / 3);
    const el = document.elementFromPoint(x, y);
    if (!el || details.contains(el)) return null;
    return el;
  }

  // Horizon scrolls .page-wrapper on desktop and the window below 990px: find whichever it is.
  function scrollerOf(el) {
    for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
      const overflowY = window.getComputedStyle(node).overflowY;
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    }
    return window;
  }

  // A closing row still carries `open` (its content must stay in the DOM to animate out of), so
  // "open" means open and not closing — otherwise a click mid-close reads as "close it again".
  function isOpen(details) {
    return details.open && details.dataset.tocState !== 'closing';
  }

  function expand(details) {
    const from = details.getBoundingClientRect().height;
    stop(details);
    details.open = true;
    details.dataset.tocState = 'opening';
    const to = details.getBoundingClientRect().height;
    animate(details, from, to, () => {
      delete details.dataset.tocState;
    });
  }

  function collapse(details) {
    const from = details.getBoundingClientRect().height;
    stop(details);
    details.dataset.tocState = 'closing';
    animate(details, from, closedHeight(details), () => {
      details.open = false;
      delete details.dataset.tocState;
    });
  }

  function animate(details, from, to, done) {
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

  function stop(details) {
    const anim = running.get(details);
    if (!anim) return;
    anim.cancel();
    running.delete(details);
  }

  // The box at rest: summary plus the panel's own padding and borders.
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

  // Timing lives in the section's token block (--acc-dur / --acc-ease), so CSS and JS cannot drift.
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

  /* ---------- 2. rail ---------- */

  function initRail(rail, body) {
    const links = Array.from(rail.querySelectorAll('[data-toc-link]'));
    if (links.length === 0 || !('IntersectionObserver' in window)) return;

    const byId = new Map();
    links.forEach((link) => {
      const id = decodeURIComponent(link.getAttribute('href').slice(1));
      const heading = document.getElementById(id);
      if (heading && body.contains(heading)) byId.set(heading, link);
    });
    if (byId.size === 0) return;

    const headings = Array.from(byId.keys());
    const visible = new Set();

    // "Current" = the last heading that has scrolled past the top third of the viewport. A heading
    // counts as passed once it is above the observer's band; the band is the top 30% of the screen.
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        });
        update();
      },
      { rootMargin: '0px 0px -70% 0px' }
    );

    function update() {
      let current = null;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top < window.innerHeight * 0.3) current = heading;
      }
      if (!current && visible.size) current = headings.find((h) => visible.has(h));
      links.forEach((link) => link.removeAttribute('aria-current'));
      if (current) byId.get(current).setAttribute('aria-current', 'true');
    }

    headings.forEach((heading) => observer.observe(heading));
    update();
  }
})();
