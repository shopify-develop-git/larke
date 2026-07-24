/* dev-reviews.js */

/* The one piece of the Judge.me widget its admin cannot change: the paginator's "Load More"
   label. Neither the Text tab nor Search & pagination exposes it, so the section renames the
   button after the app renders it. The widget arrives async and rebuilds the paginator after
   every click, so a one-shot rename is not enough — a MutationObserver re-applies it. */

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

  new MutationObserver(rename).observe(section, {
    childList: true,
    subtree: true,
    characterData: true,
  });
  rename();
}
