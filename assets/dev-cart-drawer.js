/* dev-cart-drawer.js

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
  /* dev-cart-drawer.js
     Overlay behaviour for the basket drawer.

     Contract with dev-site-header (do not break it):
     - the header owns the cart trigger. It looks this drawer up by id, and only
       preventDefaults its link (falling back to /cart otherwise) when it finds one —
       so the root's id MUST stay "cart-drawer".
     - the trigger carries aria-controls="cart-drawer" + aria-expanded. The header
       flips aria-expanded to the state it WANTS and then announces
       `site-header:cart-toggle` on `document` with no detail, so the trigger's
       aria-expanded is the signal for which way to go.
     - when the drawer closes on its own (Escape / backdrop / close button) we must push
       that state back onto the trigger, or the header would still believe it is open and
       the next click would toggle to "closed" — a dead cart button.

     Open state lives in ONE place: [data-open] on the root. Visibility, inert,
     aria-hidden and the scroll lock are all derived from it, so QA can force the drawer
     open with plain JS and get a genuinely open drawer. */

  const ROOT_SELECTOR = '.cart-drawer';
  const TRIGGER_SELECTOR = '[aria-controls="cart-drawer"]';
  const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll(ROOT_SELECTOR).forEach((drawer) => init(drawer));
  });

  function init(drawer) {
    const panel = drawer.querySelector('.cart-drawer__panel');
    if (!panel) return;

    // The element focus returns to when the drawer closes.
    let lastTrigger = null;

    const isOpen = () => drawer.dataset.open === 'true';

    /* Derive every other bit of state from [data-open]. Called by our own open/close and
       by the observer below, so a drawer forced open with `drawer.dataset.open = 'true'`
       behaves exactly like a clicked-open one. */
    function syncState() {
      const open = isOpen();

      if (open) {
        drawer.removeAttribute('aria-hidden');
        drawer.removeAttribute('inert');
      } else {
        drawer.setAttribute('aria-hidden', 'true');
        drawer.setAttribute('inert', '');
      }

      document.body.dataset.cartDrawerOpen = String(open);
    }

    function focusable() {
      return Array.from(panel.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetWidth > 0 || el.offsetHeight > 0 || el === document.activeElement
      );
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
        trigger.focus();
      }

      lastTrigger = null;
    }

    /* --- the header's toggle event ---
       The header has already written the state it wants onto the trigger, so read it
       back rather than blindly toggling — that keeps the two in step even if something
       else opened the drawer in the meantime. */
    document.addEventListener('site-header:cart-toggle', () => {
      const trigger = document.querySelector(TRIGGER_SELECTOR);

      if (!trigger) {
        if (isOpen()) close();
        else open(null);
        return;
      }

      if (trigger.getAttribute('aria-expanded') === 'true') open(trigger);
      else close();
    });

    /* --- close button + backdrop --- */
    drawer.addEventListener('click', (event) => {
      if (event.target.closest('[data-cart-drawer-close]')) close();
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

    /* Anything that flips [data-open] from outside — the theme editor, or QA forcing the
       open state for a pixel diff — gets the derived state too. */
    new MutationObserver(syncState).observe(drawer, {
      attributes: true,
      attributeFilter: ['data-open'],
    });

    /* Initial sync. A drawer rendered open (the "Open on page load" preview setting) must
       lock scroll and be focus-trappable — but must NOT steal focus, which would paint a
       focus ring into QA's pixel diff. */
    syncState();
  }

})();
