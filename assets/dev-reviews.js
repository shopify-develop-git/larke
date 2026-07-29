/* dev-reviews.js

   Wrapped in an IIFE — NOT optional on Shopify. Every section's JS is served as a CLASSIC
   script, so a top-level `init` here would land in the shared global scope and collide with
   any other section's. Keep the wrapper. */

/* The one piece of the Judge.me widget its admin cannot change: the paginator's "Load More"
   label. Neither the Text tab nor Search & pagination exposes it, so the section renames the
   button after the app renders it. The widget arrives async and rebuilds the paginator after
   every click, so a one-shot rename is not enough — a MutationObserver re-applies it. */

(function () {
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.dev-reviews').forEach((section) => init(section));
  });

  function init(section) {
    const label = section.dataset.loadMoreLabel;
    if (!label) return;

    const rename = () => {
      section.querySelectorAll('.jdgm-paginate__load-more').forEach((btn) => {
        /* The equality guard keeps the observer from re-triggering on its own write. */
        if (btn.textContent.trim() !== label) btn.textContent = label;
      });
    };

    /* childList+subtree only — the paginator arrives and rebuilds as element insertions.
       characterData used to be in here too, and it made the observer fire on every text
       tweak anywhere in a chatty third-party widget (star counts, dates, review bodies)
       for a rename that element-level mutations already cover. */
    new MutationObserver(rename).observe(section, {
      childList: true,
      subtree: true,
    });
    rename();
  }
})();
