/* dev-reveal.js
   Global scroll-reveal. Walks each content section, tags its content rows (and the items of
   any grid/list row), and fades + rises them into view on scroll — one-shot, staggered.

   Design notes:
   - Progressive enhancement: adds html.dev-reveal so the CSS hidden state only applies while
     JS runs. Under prefers-reduced-motion it returns immediately and nothing is ever hidden.
   - Above the fold on load stays visible (no flash, no animation); only below-fold content
     animates as it is scrolled to.
   - Skips chrome (header group, footer) and anything modal/overlay/hidden so a closed dialog
     can never be tagged invisible.
   - No hardcoded section list: it discovers Shopify's own .shopify-section wrappers.
*/
(function () {
  var root = document.documentElement;

  // Respect reduced motion: leave everything visible, never add the hiding hook.
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return;
  }

  var STAGGER = 80; // ms between siblings that reveal together
  var MAX_STAGGER = 400;
  var GRID = /__(blocks|grid|cards|items|list|rows|tiles|gallery|track|columns)\b/;
  var SKIP_TAG = { STYLE: 1, SCRIPT: 1, LINK: 1, TEMPLATE: 1, NOSCRIPT: 1, BR: 1, HR: 1 };
  // Things that must never be hidden (they manage their own visibility). [data-reveal-skip] is the
  // explicit opt-out for content that runs its own motion — e.g. a marquee, whose promoted layer a
  // transformed reveal ancestor would re-anchor and flash.
  var SKIP_SEL =
    '[data-reveal-skip],[hidden],[aria-hidden="true"],[role="dialog"],dialog,' +
    '[class*="modal"],[class*="drawer"],[class*="popup"],[class*="overlay"],[class*="backdrop"],' +
    '[class*="sr-only"],[class*="visually-hidden"]';

  root.classList.add('dev-reveal');

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    var sections = contentSections();
    if (!sections.length) return;

    var vh = window.innerHeight || root.clientHeight;
    var observer = new IntersectionObserver(onIntersect, {
      threshold: 0.12,
      rootMargin: '0px 0px -8% 0px',
    });

    sections.forEach(function (section) {
      groupsFor(section).forEach(function (g) {
        // Already in (or above) the viewport on load: leave it as-is, no hide, no motion.
        if (g.el.getBoundingClientRect().top < vh * 0.9) return;
        g.el.setAttribute('data-reveal', '');
        if (g.delay) g.el.style.setProperty('--reveal-delay', g.delay + 'ms');
        observer.observe(g.el);
      });
    });
  }

  function onIntersect(entries, observer) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.setAttribute('data-revealed', 'true');
      observer.unobserve(entry.target);
    });
  }

  function contentSections() {
    var all = Array.prototype.slice.call(document.querySelectorAll('.shopify-section'));
    return all.filter(function (s) {
      if (s.closest('#header-group')) return false; // announcement / header / promo
      if (s.querySelector('[class*="site-footer"]')) return false; // footer chrome
      return true;
    });
  }

  function groupsFor(section) {
    var container = contentContainer(section);
    var rows = revealableChildren(container);
    var out = [];
    rows.forEach(function (row, ri) {
      if (isGrid(row)) {
        var items = revealableChildren(row);
        if (items.length >= 2) {
          items.forEach(function (item, ii) {
            out.push({ el: item, delay: Math.min(ii * STAGGER, MAX_STAGGER) });
          });
          return;
        }
      }
      out.push({ el: row, delay: Math.min(ri * STAGGER, MAX_STAGGER) });
    });
    return out;
  }

  // Unwrap single-child wrappers (.shopify-section > dev-root > __inner > ...) to reach the
  // level where the real content rows sit side by side.
  function contentContainer(section) {
    var container = section;
    for (var i = 0; i < 4; i++) {
      var kids = revealableChildren(container);
      if (kids.length === 1 && kids[0].children.length > 0) {
        container = kids[0];
      } else {
        break;
      }
    }
    return container;
  }

  function isGrid(el) {
    return GRID.test(el.className || '') || el.tagName === 'UL' || el.tagName === 'OL';
  }

  function revealableChildren(parent) {
    var out = [];
    var kids = parent.children;
    for (var i = 0; i < kids.length; i++) {
      var k = kids[i];
      if (SKIP_TAG[k.tagName]) continue;
      if (k.matches && k.matches(SKIP_SEL)) continue;
      out.push(k);
    }
    return out;
  }
})();
