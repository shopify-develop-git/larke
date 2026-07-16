# dev-faq

An accordion of question/answer blocks for `/pages/faq`, currently holding the store's two live
delivery FAQs.

**Figma:** none. There is no FAQ artboard in the Figma file (it has Homepage, Our Story,
Tree-Fibre, Contact, Delivery, Shipping and PDP, and nothing else). The section is composed from
brand tokens plus the accordion drawn on `Accordions - Desktop` (`45068:1975`) — the same
component `dev-main-product` already implements. See **Notes** below before assuming a mock
exists somewhere unfound.
**Files:** `sections/dev-faq.liquid`, `assets/dev-faq.css`, `assets/dev-faq.js`,
`templates/page.faq.json`
**Interactive:** yes — accordion. `<details>`/`<summary>` rows open with no JS; `dev-faq.js`
upgrades them with a Web Animations API height animation and enforces one row open at a time.

## Schema settings

| Id | Type | Label | Default |
|---|---|---|---|
| `heading` | inline_richtext | Heading | "Frequently Asked Questions" |
| `subheading` | text | Subheading | (blank) |
| `background_color` | color | Background | `rgba(0,0,0,0)` |
| `text_color` | color | Text color | `#333333` |
| `accent_color` | color | Accent | `#4EA448` |
| `border_color` | color | Divider | `#C4BCA9` |
| `padding_top` | range (0–160, step 4, px) | Padding top | `80` |
| `padding_bottom` | range (0–160, step 4, px) | Padding bottom | `80` |

Order is Content → Colors → Spacing, matching the standard. No Layout header — nothing in this
section needed one.

## Blocks

| Type | Limit | Settings |
|---|---|---|
| `question` | none set in schema | `heading` (text), `body` (richtext), `open_by_default` (checkbox, default `false`) |

Preset `FAQ` ships two `question` blocks pre-filled with the two live questions (see **Content**).

## CSS custom properties

| Var | Purpose | Source |
|---|---|---|
| `--font-body` | body/answer typeface | fixed token, section `<style>` |
| `--font-heading` | heading/question typeface | fixed token, section `<style>` |
| `--container-max` | inner content width, `944px` | the one measured Figma value — width of `Accordions - Desktop` (`45068:1975`), not a page-container width |
| `--section-px` / `--section-px-mobile` | horizontal section padding | fixed token, section `<style>` |
| `--font-heading-size` / `--font-heading-size-mobile` | section `<h2>` size | fixed token |
| `--font-question-size` | question `<h3>` size, 22px — "Desktop/Title 4", the same step the PDP accordion headings use | fixed token |
| `--font-heading-weight` / `--font-heading-lh` | heading/question weight and line-height | fixed token |
| `--font-answer-size` / `--font-answer-size-mobile` | answer and subheading size | fixed token |
| `--font-body-lh` | answer/subheading line-height | fixed token |
| `--w-medium` | answer/subheading font-weight | fixed token |
| `--head-gap` | space below the section head | fixed token |
| `--icon-size` | chevron size | fixed token |
| `--acc-gap` | 24px, the row's internal spacing above the divider, above the question, and above the answer | fixed token |
| `--acc-dur` | accordion animation duration; also read back by `dev-faq.js` via `getComputedStyle` (kept in ms on purpose) | fixed token |
| `--acc-ease` | accordion animation easing, also read by `dev-faq.js` | fixed token |
| `--bg` | section background | merchant setting (`background_color`) |
| `--color` | section text color | merchant setting (`text_color`) |
| `--accent` | focus-ring color | merchant setting (`accent_color`) |
| `--border-color` | row dividers | merchant setting (`border_color`) |
| `--pt` / `--pb` | section top/bottom padding | merchant setting (`padding_top` / `padding_bottom`) |

## Responsive

Only one breakpoint exists in the CSS: `768px`. There is no 1024px rule in this section.

| Width | Behaviour |
|---|---|
| >768px | Section padding `64px` left/right (`--section-px`); heading 32px; question 22px; answer/subheading 18px. |
| ≤768px | Section padding drops to `16px` (`--section-px-mobile`); heading drops to 24px; question drops to 18px (`--font-answer-size`, reused deliberately); answer/subheading drop to 16px. |

`prefers-reduced-motion: reduce` turns off the chevron rotation transition and the answer's
opacity-fade keyframe; `dev-faq.js` independently drops the height-animation duration to `0` for
the same media query, so a reduced-motion user gets an instant open/close rather than a silent
one.

## QA result

There is no pixel diff for this section — no Figma artboard exists to diff against (see
**Figma**, above). QA here means: it lints clean, it renders correctly, its structured data is
valid, and its interactivity does what the code says it does.

| Check | Method | Result |
|---|---|---|
| Lint | `shopify theme check` | clean |
| Content renders | `/pages/faq?view=faq` | both questions and both answers present |
| Structured data | FAQPage JSON-LD parsed | valid JSON, holds both questions |
| Click handling | DevTools assertion | `event.defaultPrevented: true` on summary click — JS, not the native `<details>` toggle, drives open/close |
| Exclusivity | DevTools assertion | opening one row sets `data-faq-state="closing"` on the other |

Not part of the parallel Figma → Shopify workflow (no PM/2-dev/2-QA lanes, no round count) — this
section was built and verified directly against the design spec below, since there was no
artboard for that workflow to diff against.

**Known QA limitation:** the Chrome extension's tab is hidden, so its animation timeline is
frozen at 0 — a row's WAAPI close animation cannot be observed *finishing* there. Assert the
`data-faq-state` attributes (set synchronously by the JS) rather than waiting on the final `open`
flag, which only flips at animation-finish.

## Notes

- **No FAQ artboard exists.** The Figma file has Homepage, Our Story, Tree-Fibre, Contact,
  Delivery, Shipping and PDP — no FAQ. This section is not, and cannot be, pixel-verified against
  a reference the way its siblings are. It is composed from brand tokens plus the accordion on
  `Accordions - Desktop` (`45068:1975`); `--container-max: 944px` is that artboard's width, the
  only measured value taken from Figma here. Do not go looking for a mock that does not exist.

- **`dev-faq.js` is `dev-main-product.js`'s accordion, duplicated on purpose.** The project
  standard is three files per section (one JS file, if any, per section). Coupling `dev-faq` and
  `dev-main-product` through a shared asset to avoid duplicating ~40 lines was judged more
  expensive than the duplication itself — do not "helpfully" refactor this into a shared include.

- **The template is deliberately not assigned to the page in the Shopify admin.** It's reached
  today at `/pages/faq?view=faq`, and both the header and the footer link there
  (`sections/header-group.json`, `sections/footer-group.json`) rather than to the clean
  `/pages/faq`. Assigning the template the obvious way — Pages → FAQ → Theme template → `faq` —
  sets `template_suffix` on the *page*, which is store-level data shared with whichever theme is
  currently live. The live theme on `wearelarke.com` is a different theme with no `page.faq`
  template, so making that assignment now would affect production for no benefit. Once this theme
  is published, assigning the template is one click in the admin, and the `?view=faq` query comes
  off both links at the same time.

- **The heading font cannot render `?`.** `Test Tiempos Headline` (`snippets/dev-brand-fonts.liquid`)
  is the free trial cut of a licensed Klim font: all six weights share the same 66-glyph subset
  (`, - . 0-9 A-Z a-z`). Every question on this page falls back to another serif for its `?`. This
  is not a CSS bug and cannot be fixed in CSS — the glyph is absent from the file. It's already
  flagged in `dev-brand-fonts.liquid`; the same missing subset also breaks the PDP's
  "What's the difference?" and the homepage's "(and last)". Swapping in the licensed woff2 files
  under the same six filenames fixes all of these at once.

- **Content:** two questions, sourced from the live site's FAQ (which is held in the live theme's
  section settings, not the page body — this dev server can't see it directly), with exactly two
  corrections: the truncated live heading "How soon will" was completed to
  "How soon will my order arrive?", and "usually arrived" was fixed to "usually arrives". No new
  copy was written.

- Design spec: `docs/superpowers/specs/2026-07-14-faq-section-design.md`.
