/* dev-compare.js

   Wrapped in an IIFE — NOT optional on Shopify.

   Shopify serves every section's JS as a CLASSIC script, so all top-level `const`,
   `let` and `function` declarations share ONE global scope across every section on
   the page. A bare `function init()` or `const ROOT_SELECTOR` here would collide with
   the ones the header and its drawers already declare. Keep this wrapper — nothing
   may leak to the global scope.
*/
(function () {
  /* dev-compare.js
     The "How we compare" modal.

     - Overlay lives in dev-compare.liquid; open state is ONE thing: [data-open] on
       the root. Everything else (visibility, inert, aria-hidden, scroll lock) is
       derived from it, so QA / the theme editor can force it open with plain JS.
     - Opened by any element carrying [data-compare-open] (the two PDP triggers).
     - The competitor toggle is a tablist; the white indicator slides to the active
       tab, whose panel is shown while the others are `hidden`. */

  const ROOT_SELECTOR = '.dev-compare';
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector(ROOT_SELECTOR);
    if (root) init(root);
  });

  function init(root) {
    const panel = root.querySelector('.dev-compare__panel');
    if (!panel) return;

    const indicator = root.querySelector('.dev-compare__toggle-indicator');
    const tabs = Array.from(root.querySelectorAll('[data-compare-tab]'));
    const panels = Array.from(root.querySelectorAll('[data-compare-panel]'));

    let lastTrigger = null;

    const isOpen = () => root.dataset.open === 'true';

    /* Derive every other bit of state from [data-open], so a modal forced open with
       `root.dataset.open = 'true'` behaves exactly like a clicked-open one. */
    function syncState() {
      const open = isOpen();

      if (open) {
        root.removeAttribute('aria-hidden');
        root.removeAttribute('inert');
      } else {
        root.setAttribute('aria-hidden', 'true');
        root.setAttribute('inert', '');
      }

      // Theme-native scroll lock (base.css: html[scroll-lock] freezes .page-wrapper
      // on desktop and the document on mobile).
      document.documentElement.toggleAttribute('scroll-lock', open);
      document.body.dataset.compareOpen = String(open);
    }

    function focusable() {
      return Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
      );
    }

    function open(trigger) {
      if (isOpen()) return;

      lastTrigger = trigger || null;
      if (trigger) trigger.setAttribute('aria-expanded', 'true');
      root.dataset.open = 'true';
      syncState();

      // Reposition now that the panel is visible (fonts/resize may have shifted widths).
      positionIndicator(activeTab());

      // Focus the panel itself with preventScroll — the same trick the size guide uses so
      // the slide-in isn't scrolled flat before it has a chance to animate.
      panel.focus({ preventScroll: true });
    }

    function close() {
      if (!isOpen()) return;

      root.dataset.open = 'false';
      syncState();

      if (lastTrigger) {
        lastTrigger.setAttribute('aria-expanded', 'false');
        if (typeof lastTrigger.focus === 'function') lastTrigger.focus({ preventScroll: true });
      }
      lastTrigger = null;
    }

    /* --- competitor toggle (tablist) --- */

    function activeTab() {
      return tabs.find((t) => t.getAttribute('aria-selected') === 'true') || tabs[0];
    }

    function positionIndicator(tab) {
      if (!indicator || !tab) return;
      // offsetLeft is relative to the toggle track (its offset parent), so it already
      // accounts for the 4px padding and the inter-tab gaps.
      indicator.style.width = tab.offsetWidth + 'px';
      indicator.style.left = tab.offsetLeft + 'px';
    }

    function selectTab(key) {
      tabs.forEach((tab) => {
        const selected = tab.dataset.compareTab === key;
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
      });
      panels.forEach((p) => {
        p.hidden = p.dataset.comparePanel !== key;
      });
      positionIndicator(tabs.find((t) => t.dataset.compareTab === key));
    }

    /* --- triggers: bound DIRECTLY to each [data-compare-open], exactly the way the
       product's size/season guides bind their [data-guide-open] triggers. NOT a
       document-level delegate — nothing else on the page can reach this handler, so no
       other button can open the modal. --- */
    document.querySelectorAll('[data-compare-open]').forEach((trigger) => {
      trigger.addEventListener('click', (event) => {
        event.preventDefault();
        open(trigger);
      });
    });

    /* --- close button, backdrop, and tab clicks --- */
    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-compare-close]')) {
        close();
        return;
      }
      const tab = event.target.closest('[data-compare-tab]');
      if (tab) {
        selectTab(tab.dataset.compareTab);
        tab.focus();
      }
    });

    /* --- Escape, the focus trap, and arrow-key tab nav --- */
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      const onTab = event.target.closest('[data-compare-tab]');
      if (onTab && (event.key === 'ArrowRight' || event.key === 'ArrowLeft')) {
        event.preventDefault();
        const i = tabs.indexOf(onTab);
        const next = event.key === 'ArrowRight' ? (i + 1) % tabs.length : (i - 1 + tabs.length) % tabs.length;
        selectTab(tabs[next].dataset.compareTab);
        tabs[next].focus();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = focusable();
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

    /* Anything that flips [data-open] from outside (editor / QA) gets derived state too. */
    new MutationObserver(syncState).observe(root, {
      attributes: true,
      attributeFilter: ['data-open'],
    });

    /* Initial paint of the sliding indicator, plus re-measures for the moments that
       change tab widths: web-font swap, full load, and viewport resize. Resize is
       debounced (same 150ms as dev-three-step) — it used to run the offsetWidth read
       + style write on every resize event, modal open or not; now it settles once,
       and a closed modal skips the work entirely (open() repositions the indicator
       on the way back in anyway). */
    positionIndicator(activeTab());
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => positionIndicator(activeTab()));
    }
    window.addEventListener('load', () => positionIndicator(activeTab()));

    let resizeTimer = 0;
    window.addEventListener(
      'resize',
      () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (root.dataset.open !== 'true') return;
          positionIndicator(activeTab());
        }, 150);
      },
      { passive: true }
    );

    syncState();
  }
})();
