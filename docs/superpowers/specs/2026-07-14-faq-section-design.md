# FAQ section — design

**Date:** 2026-07-14
**Status:** approved, not yet implemented

## Problem

`/pages/faq` exists in the store, the header and the footer both link to it, and it renders
nothing but a title. The page has no content and the theme has no template for it.

The FAQ copy that does exist lives on the production site (`wearelarke.com/pages/faq`), where it
is held in the *live* theme's section settings rather than in the page body — which is why the
page comes back empty through our dev server. There are exactly two questions, both about
delivery.

## Constraint that shapes everything

**There is no FAQ artboard in Figma.** The file has Homepage, Our Story, Tree-Fibre, Contact,
Delivery, Shipping and PDP, and nothing else. So this section cannot be pixel-verified against a
reference the way every other section in this theme was, and "match our design" cannot mean
"diff it against the mock".

Instead it is composed from the brand tokens plus one component we already own: the accordion
drawn on the **`Accordions - Desktop`** artboard (`45068:1975`) and implemented in
`dev-main-product`. The FAQ borrows that component's visual language, so the page reads as part
of the site rather than as a new invention.

## Files

```
sections/dev-faq.liquid    structure + schema
assets/dev-faq.css         styles
assets/dev-faq.js          accordion behaviour
templates/page.faq.json    page template
```

## Section

Root `.dev-faq`, brand params consumed as `var()` — `--font-body`, `--font-heading`,
`--container-max`, `--section-px`. Merchant values set inline on the wrapper: `--bg`, `--color`,
`--accent`, `--pt`, `--pb`. No hardcoded colour, font family, container width or base padding.

Content: `<h2>` for the section heading, an optional subheading, then the question list.

### Accordion

`<details>` / `<summary>`, carried over from `dev-main-product` — it opens with no JS, it is
keyboard operable and announced correctly by screen readers, and Ctrl+F finds text inside a
collapsed panel. The JS only upgrades it: animate the height, and close the open row when
another opens.

Own BEM namespace (`dev-faq__*`) and own data attributes. **Deliberately not shared with the
PDP's JS**: the standard is three files per section, and coupling two sections through a shared
asset to save ~40 lines would cost more than the duplication does.

### Blocks

Type `question`:

| setting | type | note |
|---|---|---|
| `heading` | text | the question |
| `body` | richtext | the answer |
| `open_by_default` | checkbox | |

Questions are blocks, not hardcoded markup, so the merchant adds and removes them in the theme
editor.

### Schema

Settings ordered Content → Colors → Spacing. Preset name `FAQ`.

### Structured data

The section emits `schema.org/FAQPage` JSON-LD built from the same blocks, for rich results.
It has no effect on the rendered layout.

## Content

The two real questions, with two corrections and nothing invented:

1. **How soon will my order arrive?** — the live heading is truncated mid-sentence at
   "How soon will"; the answer beneath it is about delivery times, so the question is completed.
   The answer is copied verbatim except `usually arrived` → `usually arrives`.
2. **How much does delivery cost?** — verbatim; a question mark is added.

## Routing

`templates/page.faq.json` is an alternate template. It is reached with **`/pages/faq?view=faq`**,
and the header and footer links point there.

**It is deliberately NOT assigned to the page in the admin.** The obvious move — Pages → FAQ →
Theme template → `faq` — sets `template_suffix` on the *page*, and that field belongs to the store,
not to a theme. `wearelarke.com` is a live, public storefront running a **different** theme, one
that has no `page.faq` template. Setting the suffix would therefore reach across into production
and put a real customer-facing page at risk for no gain here. The owner's call was to leave it.

When our theme is published, assigning the template is one click in the admin, and the `?view=faq`
query can come off the two links at the same time.

## Verification

- `/pages/faq?view=faq` on the dev server renders the section with both questions.
- Keyboard: each row opens and closes with Enter/Space; focus is visible.
- With JS disabled the rows still open — the `<details>` fallback.
- `shopify theme check` reports no new offences.
- After the admin assignment, the clean `/pages/faq` returns 200 and renders the section.

## Known limitation: the heading font has no `?`

The Tiempos Headline files in `assets/` are the free **trial** cut — all six weights carry the same
66-glyph subset: `, - . 0-9 A-Z a-z`. There is no question mark in them, so every question heading
on this page renders its `?` in a fallback serif. No CSS can fix this; the glyph does not exist in
the file.

`snippets/dev-brand-fonts.liquid` already warns that these files must be swapped for the licensed
release before production. This section is simply the first place the missing glyphs became
visible. The same subset also breaks the PDP's `What's the difference?` and `Why you'll love it`,
and the homepage's `(and last)` — apostrophes, exclamation marks, parentheses and colons are all
absent too. Dropping in the licensed woff2 files under the same six names fixes all of it at once.

## Out of scope

- Writing new FAQ copy. Only the two questions that exist are shipped; the merchant adds more in
  the theme editor.
- Categories or search. Two questions do not justify either.
