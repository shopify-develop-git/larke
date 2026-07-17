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

    /* --- remove a line ---
       The link is a genuine /cart/change link and still works with JS off. Followed natively it
       changes the cart and lands the buyer on /cart, which is a page they never asked for and did
       not come from — they were in the basket, looking at what else they had. So the click is
       intercepted and the same change is made over fetch, in place.

       Delegated from the ROOT, not bound to each link: the item list is replaced wholesale on every
       refresh below, so a listener bound to a link would be thrown away with the first removal and
       the second one would navigate. */
    drawer.addEventListener('click', (event) => {
      const link = event.target.closest('[data-cart-remove]');
      if (!link || !drawer.dataset.cartChangeUrl) return;

      event.preventDefault();
      removeLine(link);
    });

    async function removeLine(link) {
      // A double click must not fire a second change. The first one already re-renders the list,
      // and by then this line is a different line — or gone.
      if (link.dataset.busy === 'true') return;
      link.dataset.busy = 'true';
      drawer.setAttribute('aria-busy', 'true');

      try {
        const response = await fetch(drawer.dataset.cartChangeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ id: link.dataset.lineKey, quantity: 0 }),
        });

        if (!response.ok) throw new Error('cart change rejected');

        await refresh();

        /* Focus was on the link we just deleted. Left alone it falls to <body> — outside the modal
           the focus trap is guarding — so a keyboard user's next Tab walks the page behind the
           drawer. Hand it to the close button, which is the one control the drawer always has. */
        const next = focusable()[0];
        if (next && isOpen()) next.focus();
      } catch (e) {
        // The change never landed. Fall back to the plain link we just prevented: a page load and
        // /cart is worse than staying put, but it is far better than a Remove button that silently
        // does nothing.
        window.location.href = link.href;
      } finally {
        drawer.removeAttribute('aria-busy');
        if (link.isConnected) link.dataset.busy = 'false';
      }
    }

    /* Re-render from a real page load of the cart, and swap in only what changed.

       Shopify's Section Rendering API cannot do this: it does not render `content_for 'blocks'`, so
       ?sections=dev-site-header comes back with the cart button and no drawer inside it at all.
       Asking the cart page for the cart is honest, and it is the cheapest page that carries the
       header. (dev-main-product.js does the same thing after an add — the two agree by
       construction, because they read the same markup.) */
    async function refresh() {
      const response = await fetch(drawer.dataset.cartUrl, { headers: { Accept: 'text/html' } });
      if (!response.ok) throw new Error('cart page did not render');

      const doc = new DOMParser().parseFromString(await response.text(), 'text/html');

      /* div.cart-drawer, NOT #cart-drawer and NOT .cart-drawer__content on its own: Horizon's stock
         drawer is rendered into every page by layout/theme.liquid, and it claims BOTH that id and
         that class. An unscoped lookup is a coin toss decided by document order. Ours is the div. */
      const fresh = doc.querySelector('div.cart-drawer');
      if (!fresh) throw new Error('no drawer in the fresh cart page');

      /* Content AND footer — both regions the cart's contents decide.

         The footer is not trim: the checkout button lives in it, and it renders only when the
         basket has something in it ({% if cart.item_count > 0 %}). Swapping the content alone
         froze that decision at whatever the basket held when the PAGE loaded. Land with an empty
         basket — every first visit — add a duvet, and the drawer opened with the line item, the
         price and no checkout button anywhere: a basket you cannot buy. The mirror was as bad:
         empty the basket and "Checkout Securely" stayed, aimed at a checkout with nothing in it.

         Every listener in this file is delegated from the ROOT, so replacing what is inside it
         cannot unbind the close button, the backdrop or the focus trap. */
      ['.cart-drawer__content', '.cart-drawer__footer'].forEach((selector) => {
        const next = fresh.querySelector(selector);
        const current = drawer.querySelector(selector);
        if (next && current) current.replaceWith(next);
      });

      // The count badge only exists while the cart is non-empty, so the whole inside is swapped
      // rather than a number written into an element that may not be there. The node itself
      // survives: aria-controls and aria-expanded live on it and the header reads them back.
      const toggle = document.querySelector('.site-header__cart-toggle');
      const freshToggle = doc.querySelector('.site-header__cart-toggle');
      if (toggle && freshToggle) {
        toggle.innerHTML = freshToggle.innerHTML;
        toggle.setAttribute('aria-label', freshToggle.getAttribute('aria-label') || '');
      }
    }

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
