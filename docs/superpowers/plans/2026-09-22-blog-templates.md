# Blog templates — article page, component kit and editor workflow

> **For agentic workers:** steps use checkbox (`- [ ]`) syntax for tracking. Read
> `.claude/references/code-standards.md` and `CLAUDE.md` before touching any file.

**Goal:** turn the Larke blog from "a styled RTE dump" into a **component-driven long-form template**
that matches the proposed structure (see `docs/sections/dev-article-blog-structure.md` for the two
reference mockups), and that a non-technical editor can assemble in minutes — without a developer,
without touching Liquid, and without the page ever drifting from the rest of the site.

**Non-goal:** inventing a new visual language. Every size, colour, radius, spacing step, font and
motion curve is **taken from an already-measured `dev-*` section**. There is still no Figma artboard
for the blog (same honest caveat `dev-article.liquid` and `dev-blog.liquid` already carry), so this
plan **borrows** and records where each value came from, exactly as those two sections do.

**Tech stack:** Shopify Horizon 4.1.1, Liquid, plain CSS/JS from `assets/` (no build step).

> **Status 2026-09-22:** Tasks 2–12 built and rendered locally (liquidjs + Chromium). §1.3 changed
> during the build from class-based HTML snippets to **plain-text shortcodes** typed in the visual
> editor (`[tip]`, `[quote]`, `[icon:…]`, `[caption]`, `[plain]`) — classes do not survive a Google
> Docs paste, brackets do. Open: Task 1 baseline + Task 14 on the real store (CLI login lacks staff
> access to `wearelarke`), store setup (docs/sections/dev-article.md), Task 13 (the mockups do not
> cover the index, so it is unchanged). Full record: `docs/sections/dev-article.md`.

---

## 0. State of play (audited 2026-09-22, on `main` @ `89758e9`)

| Thing | Where | Verdict |
|---|---|---|
| Article page | `sections/dev-article.liquid` + `assets/dev-article.css`, `templates/article.json` | Solid base: measure (720px), hero ratio 3/2, LCP work, RTE tag styling. **Has none of the new structure.** |
| Blog index | `sections/dev-blog.liquid` + `assets/dev-blog.css` | Good. Tag filter is real `/tagged/` routes, pagination works. Needs breadcrumb + category chips only. |
| Card | `snippets/dev-journal-cards-card.liquid` + `dev-journal-card-tokens.liquid` | Shared by index and Our Story strip. **Reuse for Related articles — do not rebuild.** |
| Read time | `snippets/dev-article-read-time.liquid` | `custom.reading_time` metafield, else word count / 200 wpm. Keep. |
| Byline | `snippets/dev-article-author.liquid` | `custom.author` metafield, else `article.author`. **Extend to a metaobject.** |
| Accordion pattern | `dev-faq.js` / `dev-main-product.js` (`<details>` + WAAPI height, 300ms `cubic-bezier(.32,.72,0,1)`) | **Reuse for "In this article".** |
| Fonts / tokens | `snippets/dev-brand-fonts.liquid` | `--font-body` Public Sans, `--font-heading` Tiempos Headline. Never redefine. |
| Newsletter form | `sections/dev-site-footer.liquid` | Copy the markup/validation pattern for the in-article signup. |

**Tiempos caveat that bites this build:** Medium 500 and Semibold 600 are licensed; **Medium Italic is
a 67-glyph trial cut with no `’ “ – £ é &`**. The quote box in the mockup is *serif italic* and quotes
are exactly where curly apostrophes live. See Task 6.

---

## 1. Architecture

### 1.1 Three layers, three editing surfaces

```
LAYER            LIVES IN                         EDITED BY / WHERE            SCOPE
─────────────────────────────────────────────────────────────────────────────────────────
Page furniture   sections in templates/article*.json   Theme editor (drag)     ALL articles
Per-article data article metafields + metaobjects      Admin → article sidebar ONE article
Prose + inline   article.content (native RTE)          Admin → article body    ONE article
  components
```

Nothing is duplicated between layers, and each thing is edited in the one place a merchant would
look for it. The reason page furniture is *not* per-article: Shopify section blocks in
`templates/article.json` are shared by **every** article — per-article block content is impossible
without one template per post, which does not scale to a real blog.

### 1.2 Sections (page furniture) — one section per band, reorderable

`dev-article` stops being the whole page and becomes the **article body band**. The rest split out,
so an editor can reorder / hide them in the theme editor and reuse them on other templates:

| Section | Renders | New? |
|---|---|---|
| `dev-article` | breadcrumb, badge, title, deck, author row, meta, hero + caption, TOC, prose, inline components | rewrite |
| `dev-article-author` | "About the author" card | new |
| `dev-article-newsletter` | "Get thoughtful sleep tips" signup | new |
| `dev-article-related` | 3 related cards + "View all articles" | new |
| closing brand panel | "A calmer planet sleeps brighter" | new `dev-article-outro`, unless an existing section is close enough — check before building |

### 1.3 Inline components — the authoring decision

**Chosen: content-driven enhancement (hybrid).** Prose stays in Shopify's native article editor, so
`article.content` remains canonical for Shopify search, RSS, excerpts, and every SEO/AI crawler.
Components are typed as a **tiny, documented HTML pattern** the theme styles:

```html
<blockquote class="larke-quote">A cleaner bed, a clearer mind…</blockquote>

<div class="larke-tip" data-title="Top tip" data-icon="sun">
  Add a couple of clean tennis balls to the dryer…
</div>

<ul class="larke-icons">
  <li data-icon="wash-40">Wash at 40°C</li>
  <li data-icon="no-bleach">Do not use bleach</li>
</ul>

<figure class="larke-figure"><img src="…"><figcaption>A fresher, happier bed.</figcaption></figure>
```

Editors never write SVG or CSS — `data-icon` is a keyword the theme swaps for a brand vector. And
they never write these from scratch either: Task 11 ships a **component library page with a
copy-to-clipboard button per component**. Paste into the RTE's HTML view, change the words, done.

Rejected, with reasons recorded so this is not re-litigated:
- *Metaobject block list per article* — drag-to-reorder and zero HTML, but long-form writing in
  metaobject fields is miserable and `article.content` ends up empty, which breaks Shopify search,
  RSS, excerpts and the read-time fallback.
- *Section blocks in `article.json`* — nicest UI, but shared by every article. Not viable.

### 1.4 Desktop composition (judgement call — flag it, do not hide it)

Both mockups are **mobile only**. Desktop is therefore composed, not measured:
- ≥1152px: prose stays at `--measure: 720px`; the TOC promotes from an accordion into a **sticky
  left rail** with an active-section indicator. Below 1152 it is the `<details>` accordion as drawn.
- The hero keeps 3/2 at `--media-w: 960px`, unchanged.
- Tip / quote / icon panels run to the measure, not the media width.

Record this in the section's header comment the way `dev-article` already records `--measure`.

---

## 2. Data model — merchant setup (needs the Chrome extension; no Admin API token exists)

**Metaobject `author`** — one entry per writer, reused across posts:
`name` (single line) · `role` (single line) · `bio` (multi-line) · `avatar` (file) · `link` (url)

**Article metafields** (namespace `custom`, to match the two that already ship):

| Key | Type | Purpose | Fallback if empty |
|---|---|---|---|
| `author` *(exists)* | single line text | byline | `article.author` |
| `reading_time` *(exists)* | integer | overrides word-count estimate | computed |
| `author_profile` | metaobject ref → `author` | avatar + bio card | `custom.author` text, no card |
| `deck` | single line text | standfirst under the title | hidden |
| `hero_caption` | single line text | caption under the hero | hidden |
| `show_toc` | boolean | force the TOC off | on, if the post has ≥3 `<h2>` |
| `number_headings` | boolean | the "1. 2. 3." numbering in the mockup | on |
| `related_articles` | list.article_reference | manual Related override | newest in the same blog sharing a tag |
| `outro_hide` | boolean | suppress the closing brand panel | shown |

Every one is optional, and every one has a defined empty state. A post created with nothing but a
title, a body and a featured image must still render correctly — that is the acceptance bar.

---

## 3. Assets still needed (blocked on the client / design)

- [ ] **Icon set for `larke-icons` and `larke-tip`** — wash-40, no-bleach, tumble-dry, detergent-leaf,
      machine-capacity, sun/top-tip, plus a house style for future ones. Check
      `dev-main-product-care.svg`, `dev-main-product-cert-*.svg` first — the PDP may already have
      some at the right weight. Anything missing is a client request, not an invention.
- [ ] **Licensed Tiempos Medium Italic** (see §0) — the quote box needs it.
- [ ] Author avatars for the real writers.

---

## 4. Tasks

### Task 1 — Branch, scaffold, baseline
- [ ] Branch `feat/blog-templates` off `main` (`main` is the Shopify-synced branch; `dev` is ~7 weeks behind).
- [ ] `shopify theme dev --store wearelarke`, open an existing article, screenshot desktop + mobile as the before-baseline. **Never `shopify theme push`.**
- [ ] Load the docx guest post ("Sleeping Under Tree Fibre — My 5 Surprises") into a **draft** article so there is real long-form content to build against, plus one deliberately minimal post (title + body only) as the empty-state fixture.

### Task 2 — Token pass: extend `dev-article`'s `<style>` block
- [ ] Add tokens for: deck, breadcrumb, author row, avatar sizes, caption, panel (tip/quote/icons) background, panel padding/radius, rule, sticky-rail width.
- [ ] Every new token gets a one-line comment naming the measured section it was borrowed from, matching the file's existing habit. No invented values pass review.
- [ ] Panel tint: reuse the cream/`#FCF5E3` family already in `article.json`'s `badge_color`; expose as a schema colour, do not hardcode.

### Task 3 — Article header
- [ ] Breadcrumb `Blog › <tag or blog title>` as real links + `BreadcrumbList` JSON-LD.
- [ ] Deck (`custom.subtitle`), author row (avatar + "By <name>"), meta line (read time · date) — reuse `dev-article-read-time` / `dev-article-author`, never recompute.
- [ ] **Left-align** the header (the mockup does; the current section centres it) — and note the change in the header comment.
- [ ] Empty states: no deck, no avatar, no tag — nothing dangles.

### Task 4 — Hero + caption
- [ ] Keep the existing LCP work verbatim (ratio, `sizes`, quality/extension branch, `fetchpriority`). Add only the `<figcaption>` from `custom.hero_caption`.

### Task 5 — "In this article" TOC
- [ ] Build the list **in Liquid** from the `<h2>`s in `article.content` (works with JS off, crawlable), injecting stable `id`s into the body HTML in the same pass so the anchors resolve.
- [ ] `<details>`/`<summary>` markup; `assets/dev-article.js` upgrades it with the animated height + curve **copied from `dev-faq.js`** (duplication is the standard here, not a smell).
- [ ] Optional heading numbering (`custom.number_headings`) driven by CSS counters, so the numbers never desync from the TOC.
- [ ] ≥1152px: sticky rail + `IntersectionObserver` active state. `prefers-reduced-motion` respected on the smooth scroll.
- [ ] Auto-hide when the post has fewer than 3 `<h2>`s.

### Task 6 — Quote box
- [ ] `blockquote.larke-quote`: quote glyph, serif italic, tinted panel, measure width.
- [ ] **Guard the Tiempos trial cut** — if Medium Italic is still the 67-glyph file, either ship the quote in the licensed Medium with synthesised obliquing, or render curly punctuation from the fallback deliberately. Decide, document, do not let it silently break mid-word.

### Task 7 — Top tip box
- [ ] `div.larke-tip` with `data-title` and `data-icon`; icon resolved through a new `snippets/dev-article-icon.liquid` keyword→SVG map (unknown keyword renders nothing, never a broken glyph).

### Task 8 — Icon breakdown list
- [ ] `ul.larke-icons` → icon + label rows, same icon snippet, aligned to the measure, single column on mobile as drawn.

### Task 9 — Figures, dividers, and the RTE baseline
- [ ] `figure.larke-figure` + `figcaption`; bare `<img>` from the RTE keeps the existing lazy/decoding injection.
- [ ] Re-check every native tag (`h2 h3 ul ol blockquote table hr a strong em img`) against the new tokens so an editor who types nothing special still gets a correct page.

### Task 10 — Author card, newsletter, related, outro
- [ ] `dev-article-author` — avatar, name, role, bio from the `author` metaobject.
- [ ] `dev-article-newsletter` — reuse the footer's form markup + validation; success/error states.
- [ ] `dev-article-related` — `custom.related_articles` if set, else newest same-blog posts sharing a tag; renders through `dev-journal-cards-card` (**do not rebuild the card**) + "View all articles".
- [ ] `dev-article-outro` — the closing brand panel, only if no existing section already does it.
- [ ] Wire all four into `templates/article.json` in order.

### Task 11 — The editor kit (this is the "super convenient" deliverable)
- [ ] `templates/page.article-components.json` + `sections/dev-article-components.liquid`: every component rendered live, each with a **copy-to-clipboard** button for its HTML.
- [ ] `docs/sections/dev-article.md` — the component reference, the metafield table, and a "how to write a Larke post" walkthrough written for the client, not for a developer.

### Task 12 — SEO, a11y, performance
- [ ] `Article` + `BreadcrumbList` JSON-LD (headline, image, datePublished, dateModified, author, publisher).
- [ ] Heading order, landmarks, focus visibility, 44px touch targets, `aria-expanded` on the TOC.
- [ ] LCP unchanged vs baseline; CLS 0 (every image ratio-boxed); no layout shift from the sticky rail.

### Task 13 — Blog index polish
- [ ] Breadcrumb + category chips per the mockup; confirm the card is untouched so index ↔ article ↔ Our Story stay identical.

### Task 14 — QA and ship
- [ ] `shopify theme check` clean.
- [ ] Render matrix: full post · minimal post · no featured image · no author · 1 heading · 20 headings · very long title · portrait hero.
- [ ] Widths 375 / 768 / 1024 / 1440 / 1920.
- [ ] Update `docs/IMPLEMENTATION.md` (the "no Figma artboard" table).
- [ ] PR `feat/blog-templates` → `main`, with before/after screenshots.

---

## 5. Open questions

1. **Authoring model** — §1.3 assumes the hybrid. Confirm before Task 6 starts; it is cheap to change now and expensive later.
2. **Icons** — client-supplied, or do we draw them in the PDP's existing house style?
3. **`dev` branch** — ~7 weeks behind `main`. Ship this to `main` directly, or refresh `dev` first?
4. **Desktop TOC** — sticky rail (§1.4) or keep the mobile accordion at every width?
