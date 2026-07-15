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
     Product decision (design call, 2026-07-15): the whole group hides on
     scroll down and returns on scroll up or after 2s of scroll inactivity —
     every page, both breakpoints. State is a single data-header-hidden
     attribute on #header-group; dev-site-header.css does the transform.

     Scroll source differs by breakpoint (base.css): at >=990px .page-wrapper
     is the scroll container (html/body are overflow:hidden); below that the
     window scrolls. We read from whichever is active and listen on both — the
     inactive one simply never fires. */
  const IDLE_REVEAL_MS = 2000;
  const SCROLL_TOLERANCE = 4; // px — ignore jitter so tiny scrolls don't toggle

  function initHeaderScroll() {
    const group = document.getElementById('header-group');
    if (!group) return;

    const pageWrapper = document.querySelector('.page-wrapper');
    const desktop = window.matchMedia('(min-width: 990px)');

    let lastY = 0;
    let ticking = false;
    let idleTimer = 0;

    const scrollTop = () =>
      desktop.matches && pageWrapper ? pageWrapper.scrollTop : window.scrollY;

    const show = () => group.setAttribute('data-header-hidden', 'false');
    const hide = () => {
      // Keep the group reachable while the menu drawer is open.
      if (group.querySelector('.site-header[data-menu-open="true"]')) return;
      group.setAttribute('data-header-hidden', 'true');
    };

    const armIdleReveal = () => {
      window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(show, IDLE_REVEAL_MS);
    };

    const update = () => {
      ticking = false;
      const y = scrollTop();

      // Guaranteed shown only at the very top; below that it hides on the
      // first downward scroll (no group-height threshold — design call
      // 2026-07-15: hide immediately, the old threshold felt like too much).
      if (y <= SCROLL_TOLERANCE) {
        window.clearTimeout(idleTimer);
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

      armIdleReveal(); // any scroll (re)arms the 2s reveal
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
