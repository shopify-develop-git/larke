# Work report — 13 Jul 2026

**Larke** — Shopify theme (Horizon 4.1.1), Figma → pixel-verified custom sections.
30 commits. Local only — nothing pushed to a remote theme.

---

## Done

1. **Dev: Foundations** — self-hosted brand fonts (Test Tiempos Headline + Public Sans), brand cream
   page background, figma→section workflow + agent MCP wiring fixed **(done)**
2. **Dev: Shared chrome** — announcement bar, header, promo bar, footer; menu + cart drawers moved
   from sections to **header blocks**, so they are configured once and appear on every page instead
   of being re-added per template **(done)**
3. **Dev: Homepage** — 17 sections built from Figma; three-step process carousel added; two card
   backgrounds fixed (they were being overridden in the template data, not the CSS) **(done)**
4. **Dev: Headings & richtext** — all section headings converted to richtext, no h1/h2 pickers;
   hero = `h1`, sections = `h2`, blocks = `h3`; 16 stored values re-encoded so the designed line
   breaks survive **(done)**
5. **Dev: Our Story / Tree-Fibre** — templates assembled; hero, story slider and values-we-cherish
   wired in **(done)**
6. **Dev: Delivery & Returns / Shipping / Contact** — two sections cover all three pages; real
   Shopify contact form **(done — the pages themselves still need creating in admin)**
7. **Dev: PDP — main product** — sticky gallery + buy box driven by **live Shopify variants**;
   add-to-cart with price / availability / URL kept in sync; still-undecided card, accordions,
   price comparison **(done)**
8. **Dev: PDP — guides** — Size Guide and Seasons Guide drawers, CM/IN toggle, Escape + focus
   return + focus trap **(done)**
9. **Dev: PDP — content** — FAQs, Care and Certifications accordion bodies filled from the artboard
   **(done)**
10. **Dev: Blog + Article** — `dev-blog` index, article template, journal cards driven by a real
    Shopify blog with the hand-authored blocks as fallback **(done)**
11. **Dev: Bug fixes** — Horizon's colour palette was painting the contact form fields; phantom
    scrollbar in the message field; tablet layout 1200→769 (the worst point sat *above* the old
    breakpoint); Safari arrow no-op on the story slider; two files missing from git that already
    committed sections depended on **(done)**

---

## Still open

- **Pixel-diff and mobile verification not done.** This is the one real blocker. Chrome DevTools MCP
  died mid-session and does not come back without a restart; the Chrome extension is an alternative
  for DOM checks but its viewport is locked at 1024px — the one width with no Figma reference. The
  two widths that have one (1440 and 375) are unreachable from it.
- **Delivery / Shipping pages do not exist in the store.** The templates are ready and render via
  `?view=`, but `/pages/delivery` and `/pages/shipping` still 404 until the pages are created in
  admin and assigned the `delivery` / `shipping` template.
- **Variant chips show the real product data** (`Warmth: 4.5 tog`), not the artboard's
  `Tog: Lightweight`. This was a deliberate call — the section now works on any product rather than
  only the one that was drawn. Consequence: the chip **text** will never pixel-match the artboard;
  the geometry will. Renaming the option in Shopify admin would close the gap.
- **Lorem ipsum still in the copy** where Figma has it — the Delivery and Contact intro cards, and
  the answer to "Does tree-fibre smell?".
- **Three accordion bodies** on the PDP are the artboard's words verbatim, including one obvious
  typo: the first FAQ reads *"I've got allergies – will we be friends?**synthetics.**"* — the word
  has leaked out of the answer. I dropped the stray word rather than invent a new question.

---

## Notes worth keeping

- **Never run `shopify theme push`.** All work is against the local `shopify theme dev` server.
- Horizon compiles **every** stock section's `{% stylesheet %}` into one sheet that loads on every
  page. An unprefixed BEM name silently inherits stock rules; `input:not([type='checkbox'])` even
  out-specifies a single class. Every custom class is `dev-`-prefixed for this reason.
- Figma draws strokes **inside** the box; CSS adds the border **outside** the padding. Border +
  padding must add up to the Figma inset, or every bordered element ends up 2px too big.
