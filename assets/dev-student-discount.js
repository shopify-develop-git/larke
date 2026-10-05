/* dev-student-discount.js
   Re-skins the Student Beans (Beans ID) card in Larke style (owner, 2026-10-05).

   The card is a React app the Beans ID embed mounts into #beans-id-root inside an OPEN shadow root,
   so the theme's CSS cannot reach it. What we can do is hand that shadow root one extra stylesheet.
   It is attached as an adopted stylesheet, not a <style> child, so React re-rendering the card
   cannot remove it. It only changes the look — fonts, colours, radius, button — never behaviour.

   Selectors key on the app's Tailwind class tokens (read off the rendered card, 2026-10-05). If an
   app update renames them the card simply falls back to the app's own look; nothing breaks.

   Colours and fonts are var()s: custom properties inherit through the shadow boundary (the host's
   inline `all: initial` does not reset them), and @font-face rules from the page apply inside it. */

(() => {
  const CSS = `
    /* The white sheet the app puts behind the card. */
    .grid.max-w-\\[600px\\] {
      background: transparent !important;
    }

    /* The card. */
    [class*="max-w-[400px]"][class*="rounded-3"] {
      background: var(--widget-bg, #fffcf4) !important;
      border: 1px solid var(--border-color, #c4bca9) !important;
      border-radius: 32px !important;
      box-shadow: none !important;
      padding: 32px !important;
      color: var(--color, #333333) !important;
      font-family: var(--font-body) !important;
    }

    /* h1[class] / h3[class]: the headings also carry text-grey-500, which the body-text rule
       below targets — the extra [class] keeps the heading rules ahead of it. */
    [class*="max-w-[400px]"] h1[class] {
      font-family: var(--font-heading) !important;
      font-size: 32px !important;
      font-weight: 500 !important;
      line-height: 1.2 !important;
      color: var(--color, #333333) !important;
    }

    [class*="max-w-[400px]"] h3[class] {
      font-family: var(--font-heading) !important;
      font-size: 22px !important;
      font-weight: 500 !important;
      line-height: 1.2 !important;
      color: var(--color, #333333) !important;
    }

    [class*="max-w-[400px]"] p,
    [class*="max-w-[400px]"] li,
    [class*="max-w-[400px]"] [class*="text-grey-500"],
    [class*="max-w-[400px]"] [class*="text-liquorice"] {
      font-family: var(--font-body) !important;
      font-size: 16px !important;
      font-weight: 500 !important;
      line-height: 1.4 !important;
      color: var(--color, #333333) !important;
    }

    /* Divider. */
    [class*="max-w-[400px]"] [class*="bg-grey-100"] {
      background: var(--border-color, #c4bca9) !important;
    }

    /* Step numbers and the line joining them. */
    [class*="max-w-[400px]"] .rounded-full.bg-grey-500 {
      background: var(--color, #333333) !important;
      color: var(--widget-bg, #fffcf4) !important;
      font-family: var(--font-body) !important;
      font-size: 12px !important;
      font-weight: 700 !important;
      line-height: 20px !important;
    }

    [class*="max-w-[400px]"] [class*="w-[2px]"].bg-grey-500 {
      background: var(--border-color, #c4bca9) !important;
    }

    /* Get Code — Larke "Primary - Black" pill (dev-button.css .dev-btn--dark). */
    [class*="max-w-[400px]"] a[class*="bg-off-black"],
    [class*="max-w-[400px]"] button[class*="bg-off-black"] {
      display: flex !important;
      align-items: center;
      justify-content: center;
      height: auto !important;
      min-height: 56px;
      padding: 16px 24px !important;
      border-radius: 60px !important;
      background: var(--color, #333333) !important;
      color: #ffffff !important;
      font-family: var(--font-body) !important;
      font-size: 18px !important;
      font-weight: 700 !important;
      line-height: 1.4 !important;
      text-decoration: none !important;
      transition: background-color 0.3s ease-out, border-radius 0.3s ease-out;
    }

    @media (hover: hover) {
      [class*="max-w-[400px]"] a[class*="bg-off-black"]:hover,
      [class*="max-w-[400px]"] button[class*="bg-off-black"]:hover {
        background: #666666 !important;
        border-radius: 16px !important;
      }
    }

    @media (max-width: 768px) {
      [class*="max-w-[400px]"][class*="rounded-3"] {
        padding: 24px !important;
      }

      [class*="max-w-[400px]"] h1[class] {
        font-size: 24px !important;
      }

      [class*="max-w-[400px]"] h3[class] {
        font-size: 20px !important;
      }
    }
  `;

  function skin(shadow) {
    if (shadow.__larkeSkinned) return;
    shadow.__larkeSkinned = true;

    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(CSS);
      shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet];
    } catch (error) {
      // Older Safari (< 16.4) has no constructable stylesheets — fall back to a <style> child.
      const style = document.createElement('style');
      style.textContent = CSS;
      shadow.appendChild(style);
    }
  }

  function init() {
    const host = document.querySelector('.dev-student-discount #beans-id-root');
    if (!host) return;

    // The app attaches its shadow root whenever its deferred script runs — before or after ours.
    // Poll briefly rather than guess the order; give up after 15s.
    const started = performance.now();
    const tick = () => {
      if (host.shadowRoot) {
        skin(host.shadowRoot);
        return;
      }
      if (performance.now() - started < 15000) setTimeout(tick, 100);
    };
    tick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
