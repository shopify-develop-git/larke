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
    initHeaderScroll();
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

  /* --- header-group scroll hide / reveal --------------------------------
     Product decision (design call, 2026-07-15, amended 2026-07-16): the whole
     group hides on scroll down and returns ONLY on scroll up — every page, both
     breakpoints. State is a single data-header-hidden attribute on
     #header-group; dev-site-header.css does the transform.

     It used to also reveal itself after 2s of scroll inactivity. That was
     dropped on the owner's call: any scroll re-armed the timer, so stopping
     anywhere down the page brought the header back on its own, with no scroll
     up — it read as the header appearing for no reason. Reading the intent off
     an idle timer was the mistake; the only thing that means "I want the header"
     is scrolling up, so that is now the only thing that reveals it.

     Scroll source differs by breakpoint (base.css): at >=990px .page-wrapper
     is the scroll container (html/body are overflow:hidden); below that the
     window scrolls. We read from whichever is active and listen on both — the
     inactive one simply never fires. */
  const SCROLL_TOLERANCE = 4; // px — ignore jitter so tiny scrolls don't toggle

  function initHeaderScroll() {
    const group = document.getElementById('header-group');
    if (!group) return;

    const pageWrapper = document.querySelector('.page-wrapper');
    const desktop = window.matchMedia('(min-width: 990px)');

    let lastY = 0;
    let ticking = false;

    const scrollTop = () =>
      desktop.matches && pageWrapper ? pageWrapper.scrollTop : window.scrollY;

    const show = () => group.setAttribute('data-header-hidden', 'false');
    const hide = () => {
      // Keep the group reachable while the menu drawer is open.
      if (group.querySelector('.site-header[data-menu-open="true"]')) return;
      group.setAttribute('data-header-hidden', 'true');
    };

    const update = () => {
      ticking = false;
      const y = scrollTop();

      // Guaranteed shown only at the very top; below that it hides on the
      // first downward scroll (no group-height threshold — design call
      // 2026-07-15: hide immediately, the old threshold felt like too much).
      if (y <= SCROLL_TOLERANCE) {
        show();
        lastY = y;
        return;
      }

      const delta = y - lastY;
      if (delta > SCROLL_TOLERANCE) {
        hide();
      } else if (delta < -SCROLL_TOLERANCE) {
        show();
      }

      // Note there is no else: a scroll smaller than the tolerance leaves the
      // header exactly as it is. Standing still is not a request for it.
      lastY = y;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(update);
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    pageWrapper?.addEventListener('scroll', onScroll, { passive: true });

    // When the breakpoint flips, the scroll container swaps (.page-wrapper
    // <-> window); resync lastY so the next delta isn't measured against a
    // reading taken from the other scroller.
    desktop.addEventListener('change', () => { lastY = scrollTop(); });

    show();
    lastY = scrollTop();
  }

})();
