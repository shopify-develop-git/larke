/* dev-three-step.js

   Wrapped in an IIFE — NOT optional on Shopify.

   Shopify serves every section's JS as a CLASSIC script, so all top-level `const`, `let` and
   `function` declarations land in ONE shared global scope. Two sections here independently declared
   `function init()` once before; the last script to load silently replaced everyone else's. Nothing
   may leak to the global scope. Keep this wrapper.
*/
(function () {
  const ROOT = '.dev-three-step';
  const CARD = '.dev-three-step__card';
  const DOT = '.dev-three-step__dot';
  const ACTIVE = 'dev-three-step__card--active';

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll(ROOT).forEach((section) => init(section));
  });

  function init(section) {
    const track = section.querySelector('.dev-three-step__track');
    const cards = Array.from(section.querySelectorAll(CARD));
    const dots = Array.from(section.querySelectorAll(DOT));
    const prev = section.querySelector('.dev-three-step__arrow--prev');
    const next = section.querySelector('.dev-three-step__arrow--next');

    // One step is not a carousel. The controls aren't rendered in that case either.
    if (!track || cards.length < 2) return;

    let index = cards.findIndex((card) => card.classList.contains(ACTIVE));
    if (index < 0) index = 0;

    /* Reserve the row height, or the section jumps.

       The active step is taller than an inactive one (64px block padding against 32px) AND its text
       block is narrower (300px against 332px), so it wraps to more lines. Both effects depend on the
       step's own copy, which means the row's height changes depending on WHICH step is active — and
       every section below it on the page slides up and down as you click through.

       There is no CSS-only fix: the height depends on text metrics. So measure each step in its
       active state once, and pin the track to the tallest. Cards stay centred inside it, so the row
       still looks exactly as designed — it just stops resizing. */
    function reserveHeight() {
      // Mobile has no carousel and no active state: let it size naturally.
      if (window.matchMedia('(max-width: 768px)').matches) {
        track.style.minHeight = '';
        return;
      }

      track.classList.add('dev-three-step__track--measuring');

      let tallest = 0;
      cards.forEach((_, i) => {
        cards.forEach((card, n) => card.classList.toggle(ACTIVE, n === i));
        tallest = Math.max(tallest, cards[i].getBoundingClientRect().height);
      });

      // Put the real active step back before anyone can see the measuring passes.
      cards.forEach((card, n) => card.classList.toggle(ACTIVE, n === index));
      track.classList.remove('dev-three-step__track--measuring');

      track.style.minHeight = Math.ceil(tallest) + 'px';
    }

    reserveHeight();

    // Text metrics change when the webfonts land and when the viewport resizes — remeasure.
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(reserveHeight);

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(reserveHeight, 150);
    });

    function setActive(nextIndex) {
      // Wrap around: the artboard draws no disabled arrow state, so there is no end to hit.
      index = (nextIndex + cards.length) % cards.length;

      cards.forEach((card, i) => card.classList.toggle(ACTIVE, i === index));
      dots.forEach((dot, i) => dot.setAttribute('aria-current', String(i === index)));

      // Only scroll when the track actually overflows. At >=1280 all three cards are visible and
      // nothing should move; below that the active card is centred. Scrolling the TRACK (not
      // scrollIntoView) keeps the page itself from jumping vertically.
      if (track.scrollWidth > track.clientWidth) {
        const card = cards[index];
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        track.scrollTo({
          left: card.offsetLeft - (track.clientWidth - card.clientWidth) / 2,
          behavior: reduce ? 'auto' : 'smooth',
        });
      }
    }

    if (prev) prev.addEventListener('click', () => setActive(index - 1));
    if (next) next.addEventListener('click', () => setActive(index + 1));

    dots.forEach((dot, i) => dot.addEventListener('click', () => setActive(i)));

    // The inactive cards are buttons in Figma (cursor: pointer) — clicking one selects it. The dots
    // and arrows remain the keyboard-accessible controls; this is mouse convenience on top.
    cards.forEach((card, i) => card.addEventListener('click', () => setActive(i)));
  }
})();
