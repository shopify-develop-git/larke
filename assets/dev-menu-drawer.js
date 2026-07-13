/* dev-menu-drawer.js

   Wrapped in an IIFE — NOT optional on Shopify.

   Shopify serves every section's JS as a CLASSIC script, so all top-level `const`,
   `let` and `function` declarations land in ONE shared global scope. Four sections
   here independently declared `function init()`; function declarations overwrite
   each other, so the LAST script to load silently replaced everyone else's init —
   the header ended up calling a drawer's init and its buttons did nothing at all.
   Both drawers also declared `const ROOT_SELECTOR`, which is a hard SyntaxError
   and stopped cart-drawer.js from running entirely.

   Nothing may leak to the global scope. Keep this wrapper.
*/
(function () {
  /* dev-menu-drawer.js
     Overlay behaviour for the menu drawer.

     Contract with dev-site-header (do not break it):
     - the header owns the hamburger and announces `site-header:menu-toggle`
       on `document` with `detail.open`; it never touches this drawer's DOM.
     - its trigger carries aria-controls="menu-drawer" + aria-expanded, and the
       header section carries data-menu-open. When the drawer closes on its own
       (Escape / backdrop / close button) we must push that state back onto the
       trigger, or the header would still believe it is open and the next click
       would toggle to "closed" — a dead hamburger.

     Open state lives in ONE place: [data-open] on the root. Everything else
     (visibility, inert, aria-hidden, scroll lock) is derived from it, so QA can
     force the drawer open with plain JS and get a genuinely open drawer. */

  const ROOT_SELECTOR = '.dev-menu-drawer';
  const TRIGGER_SELECTOR = '[aria-controls="menu-drawer"]';
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll(ROOT_SELECTOR).forEach((drawer) => init(drawer));
  });

  function init(drawer) {
    const panel = drawer.querySelector('.dev-menu-drawer__panel');
    if (!panel) return;

    // The element focus returns to when the drawer closes.
    let lastTrigger = null;

    const isOpen = () => drawer.dataset.open === 'true';

    /* Derive every other bit of state from [data-open]. Called both by our own
       open/close and by the observer below, so a drawer forced open with
       `drawer.dataset.open = 'true'` behaves exactly like a clicked-open one. */
    function syncState() {
      const open = isOpen();

      if (open) {
        drawer.removeAttribute('aria-hidden');
        drawer.removeAttribute('inert');
      } else {
        drawer.setAttribute('aria-hidden', 'true');
        drawer.setAttribute('inert', '');
      }

      document.body.dataset.menuDrawerOpen = String(open);
    }

    function open(trigger) {
      if (isOpen()) return;

      lastTrigger = trigger || document.querySelector(TRIGGER_SELECTOR);
      drawer.dataset.open = 'true';
      syncState();

      // Focus the first thing in the panel (the close button) so the drawer is
      // immediately dismissable from the keyboard.
      const first = focusable()[0];
      if (first) first.focus();
    }

    function close() {
      if (!isOpen()) return;

      drawer.dataset.open = 'false';
      syncState();

      // Hand the header's disclosure state back, then return focus to it.
      const trigger = lastTrigger || document.querySelector(TRIGGER_SELECTOR);
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
        const header = trigger.closest('.site-header');
        if (header) header.setAttribute('data-menu-open', 'false');
        trigger.focus();
      }

      lastTrigger = null;
    }

    function focusable() {
      return Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
      );
    }

    /* --- the header's toggle event --- */
    document.addEventListener('site-header:menu-toggle', (event) => {
      const wantsOpen = event.detail && event.detail.open;
      if (wantsOpen) {
        open(document.querySelector(TRIGGER_SELECTOR));
      } else {
        close();
      }
    });

    /* --- close button + backdrop --- */
    drawer.addEventListener('click', (event) => {
      if (event.target.closest('[data-menu-drawer-close]')) close();
    });

    /* --- Escape, and the focus trap --- */
    drawer.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }

      if (event.key !== 'Tab') return;

      const items = focusable();
      if (items.length === 0) return;

      const first = items[0];
      const last = items[items.length - 1];

      // Wrap at both ends so focus can never escape an open modal drawer.
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });

    /* Anything that flips [data-open] from outside — the theme editor, or QA
       forcing the open state for a pixel diff — gets the derived state too. */
    new MutationObserver(syncState).observe(drawer, {
      attributes: true,
      attributeFilter: ['data-open'],
    });

    /* Initial sync. A drawer rendered open (the "Open on page load" preview
       setting) must lock scroll and be focus-trappable — but must NOT steal
       focus, which would paint a focus ring into QA's pixel diff. */
    syncState();
  }

})();
