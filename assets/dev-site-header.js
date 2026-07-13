/* dev-site-header.js

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
  /* dev-site-header.js
     Wires the header's two disclosure triggers (menu / cart) as accessible
     buttons only — it does NOT build the drawers themselves (see contract,
     Interactivity: menu_drawer / basket are separate components built
     later). This section's job ends at aria-state + a custom event; the
     future drawer components attach to those without this file changing. */

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.site-header').forEach((section) => init(section));
  });

  function init(section) {
    section.addEventListener('click', (event) => {
      const menuToggle = event.target.closest('.site-header__menu-toggle');
      if (menuToggle) {
        handleMenuToggle(section, menuToggle);
        return;
      }

      const cartToggle = event.target.closest('.site-header__cart-toggle');
      if (cartToggle) {
        handleCartToggle(cartToggle, event);
      }
    });
  }

  function handleMenuToggle(section, trigger) {
    if (!trigger) return;

    const isOpen = trigger.getAttribute('aria-expanded') === 'true';
    const next = !isOpen;

    trigger.setAttribute('aria-expanded', String(next));
    section.setAttribute('data-menu-open', String(next));

    document.dispatchEvent(
      new CustomEvent('site-header:menu-toggle', { detail: { open: next } })
    );
  }

  function handleCartToggle(trigger, event) {
    if (!trigger) return;

    const drawer = document.getElementById('cart-drawer');

    if (!drawer) {
      // The basket component doesn't exist in the DOM yet — leave the
      // trigger as a real, working link to the cart page (no-JS/pre-basket
      // fallback). Nothing actually opened, so aria-expanded stays false.
      trigger.setAttribute('aria-expanded', 'false');
      return;
    }

    event.preventDefault();

    const isOpen = trigger.getAttribute('aria-expanded') === 'true';
    const next = !isOpen;

    trigger.setAttribute('aria-expanded', String(next));

    document.dispatchEvent(new CustomEvent('site-header:cart-toggle'));
  }

})();
