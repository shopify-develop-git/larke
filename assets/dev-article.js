/* dev-article.js
   The "In this article" dropdown — the same at every width (owner, 2026-10-01). Progressive: it is a
   <details>, so it opens and its links jump with scripting off. This file adds:

   1. the animated open/close (dev-faq.js's height animation, duplicated on purpose — see dev-faq.liquid)
   2. tapping a row scrolls smoothly to that heading and leaves the box OPEN (owner, 2026-10-01).
      Earlier builds closed it — first ~300ms after the jump, then before it — and either way the box
      collapsed while the page was moving, which on iPhone Safari read as the page "buffering" or
      jumping. Nothing changes size during the scroll now. The landing spot is computed here rather
      than left to scroll-margin, because the sticky header slides away as the page scrolls down:
      an offset taken at the moment of the tap (header showing) would leave a gap at the end.
   3. auto-close once the whole box has been scrolled off-screen (owner, 2026-09-28), with the reading
      position pinned so nothing visible moves.
   4. --header-clear: the sticky site header's live bottom edge, so a heading lands below the header. */
(function () {
  const running = new WeakMap();

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-article]').forEach((root) => init(root));
  });

  function init(root) {
    root.querySelectorAll('[data-toc]').forEach((details) => initAccordion(details));

    trackHeader(root);
  }

  /* ---------- header clearance ----------
     The site header (#header-group, dev-site-header) is sticky and slides away on scroll-down and
     back in on scroll-up, so no fixed offset is right in both states. Its visible bottom edge is
     measured every frame it can change and written to --header-clear on the section root; every
     heading's scroll-margin reads it, so a contents jump lands just below the header.
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

    // Tapping a row: keep the box open, glide to the heading, write the hash without a second jump.
    details.addEventListener('click', (event) => {
      const link = event.target.closest('[data-toc-link]');
      if (!link) return;
      const id = decodeURIComponent(link.getAttribute('href').slice(1));
      const target = document.getElementById(id);
      if (!target) return;
      event.preventDefault();
      scrollToHeading(details, target);
      if (history.replaceState) history.replaceState(null, '', '#' + id);
    });

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

  /* ---------- scrolling to a heading ----------
     Every contents row points DOWN the page (the box sits before the first heading), and the site
     header hides on any downward scroll (dev-site-header.js). So the heading lands --spacing-md below
     the top of the screen with no header allowance. `navigating` holds the auto-close off until the
     scroll has come to rest, so the box can never collapse mid-glide. */
  const navigating = new WeakSet();

  function scrollToHeading(details, target) {
    const scroller = scrollerOf(details);
    const gap = parseFloat(window.getComputedStyle(details).getPropertyValue('--spacing-md')) || 24;
    const current = scroller === window ? window.scrollY : scroller.scrollTop;
    const top = Math.max(0, Math.round(current + target.getBoundingClientRect().top - gap));
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';

    navigating.add(details);
    settle(scroller, () => navigating.delete(details));
    scroller.scrollTo({ top, behavior });
  }

  // Calls done() once the scroller has stopped moving: `scrollend` where the browser has it, and a
  // quiet-period check as the fallback (older Safari has no scrollend). Never longer than 2s.
  function settle(scroller, done) {
    let finished = false;
    let quiet = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      scroller.removeEventListener('scroll', onScroll);
      scroller.removeEventListener('scrollend', finish);
      window.clearTimeout(quiet);
      window.clearTimeout(cap);
      done();
    };
    const onScroll = () => {
      window.clearTimeout(quiet);
      quiet = window.setTimeout(finish, 180);
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    scroller.addEventListener('scrollend', finish);
    const cap = window.setTimeout(finish, 2000);
    onScroll();
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
      if (!isOpen(details) || navigating.has(details)) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        if (isOpen(details) && !navigating.has(details) && !onScreen(details)) closeInPlace(details);
      }, CLOSE_DELAY);
    });

    observer.observe(details);
  }

  function onScreen(el) {
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight;
  }

  function closeInPlace(details) {
    const scroller = scrollerOf(details);
    const anchor = readingAnchor(details);
    const before = anchor ? anchor.getBoundingClientRect().top : 0;

    // One correction, the same in every browser: the browser's own scroll anchoring (Chrome,
    // Firefox) is switched off for this one layout change and the shift is put back by hand — Safari
    // has no anchoring at all, and letting some browsers anchor while others are corrected here
    // is how a correction ends up applied twice, or not at all.
    // The theme also sets `scroll-behavior: smooth` on html and .page-wrapper (base.css), which would
    // turn the correction into a visible glide. It is switched to `auto` for the same moment.
    const anchored = [document.documentElement, document.querySelector('.page-wrapper')].filter(Boolean);
    anchored.forEach((el) => {
      el.style.setProperty('overflow-anchor', 'none');
      el.style.setProperty('scroll-behavior', 'auto');
    });

    stop(details);
    details.open = false;
    delete details.dataset.tocState;
    details.style.overflow = '';
    details.style.height = '';

    if (anchor) {
      const shift = anchor.getBoundingClientRect().top - before;
      if (Math.abs(shift) > 0.5) {
        scroller.scrollBy({ top: shift, behavior: 'instant' });
        window.dispatchEvent(new CustomEvent('dev:scroll-adjusted', { detail: { shift } }));
      }
    }

    window.requestAnimationFrame(() => anchored.forEach((el) => {
      el.style.removeProperty('overflow-anchor');
      el.style.removeProperty('scroll-behavior');
    }));
  }

  // The reference for "did the page move": the first block of the article body still on screen.
  // It has to be real page content. An earlier version took whatever sat at a fixed point on the
  // screen, and on iPhone Safari that can be a fixed overlay (chat button, banner) that never moves,
  // so a 641px lurch measured as 0 and went uncorrected (WebKit test, 2026-10-01). Chrome hid the bug
  // by anchoring the scroll itself.
  function readingAnchor(details) {
    const body = details.closest('[data-article-body]');
    const blocks = body ? body.children : [];
    for (const el of blocks) {
      if (el === details || el.contains(details)) continue;
      if (el.getBoundingClientRect().bottom > 0) return el;
    }
    return details.nextElementSibling;
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

})();
