# Blog post — `dev-article` and its companions

The blog post page, rebuilt 2026-09-22 to the client's structure mockups
(`docs/sections/dev-article-blog-structure.md`). **No Figma artboard exists for the blog**, so nothing
here is pixel-diffed. Every value is borrowed from a measured section and its source is recorded in
the header comment of the file that uses it.

## Files

| File | Role |
|---|---|
| `sections/dev-article.liquid` + `assets/dev-article.css` + `assets/dev-article.js` | Breadcrumb, title, subtitle, byline, hero + caption, contents (accordion / rail), body |
| `sections/dev-article-author.liquid` + `.css` | "About the author" card (renders nothing without an author profile) |
| `sections/dev-article-newsletter.liquid` + `.css` | Signup. Native `customer` form, tagged `newsletter,blog` |
| `sections/dev-article-related.liquid` + `.css` | 3 related posts on the **shared** journal card + "View all articles" |
| `sections/dev-article-outro.liquid` + `.css` | Closing panel ("A calmer planet sleeps brighter.") |
| `sections/dev-article-components.liquid` + `.css` + `.js` | The editor's component library page |
| `snippets/dev-article-body.liquid` | Shortcode processor + heading anchors — used by the post AND the library |
| `snippets/dev-article-tokens.liquid` | The post's design tokens — shared by the post and the library |
| `snippets/dev-article-icon.liquid` | The 20-icon set, called by keyword |
| `templates/article.json` | Order: article → author → newsletter → related → outro |
| `templates/page.article-components.json` | The library page template |

## How an editor writes a post

Everything is typed in Shopify's **normal visual editor**. No HTML view.

| Want | Type |
|---|---|
| A section heading | Format the line as **Heading 2**. It is numbered and listed in "In this article" automatically. |
| A heading outside the numbering | `[plain]The bottom line` as the Heading 2 text |
| Quote box | The editor's **Quote** format, or three lines: `[quote]` / the quote / `[/quote]` |
| Top tip | `[tip]` / title line / the tip / `[/tip]`. Other icon: `[tip:leaf]` |
| Icon breakdown | A bullet list whose points start with `[icon:wash-40]`, `[icon:no-bleach]` … |
| Image caption | Insert the image; next line: `[caption] A fresher, happier bed.` |

Icons come from two places, checked in this order:

1. **Built-in** (drawn into the theme): `wash-30 wash-40 wash-60 no-bleach tumble-dry tumble-dry-low
   no-tumble-dry dry-flat iron-low machine leaf sun moon thermometer drop wind tree shield heart check`.
2. **Uploaded** — Content → Metaobjects → **Article icon**: a `name` and an `icon` file (SVG or
   transparent PNG). `[icon:that-name]` and `[tip:that-name]` then work in every post. Only the
   file's shape is used (CSS mask): it is shown in the text colour at the built-ins' size, so an
   upload in any colour matches the set. Names are compared handleized ("Hand wash" = `hand-wash`),
   and a built-in name always wins a clash. Example entry in the store: `hand-wash`. An unknown name is left
visibly as typed, so a typo shows in the preview instead of breaking the page. An unclosed `[tip]` or
`[quote]` is also left as typed (the processor only expands balanced pairs).

"In this article" appears once a post has **3+ Heading 2s**. Below 1280px it is an accordion placed
just before the first heading (after the intro, as the mockup draws it); from 1280px it is a sticky
rail beside the text that highlights the section being read.

The **first tag** is the post's category: breadcrumb, card badge, and the related-posts match.

## Store setup — one-time, in the Shopify admin (Chrome extension; no API token exists)

**1. Metaobject definition** — Settings → Custom data → Metaobjects → Add definition
- Name `Author`, type `author`
- Fields: `name` (single line text, required) · `role` (single line text) · `bio` (multi-line text) ·
  `avatar` (file, images only) · `link` (URL)
- Enable "Storefronts" access.

**2. Article metafield definitions** — Settings → Custom data → Blog posts → Add definition.
Namespace `custom` for all (two already exist):

| Name | Key | Type |
|---|---|---|
| Author *(exists)* | `custom.author` | Single line text |
| Reading time *(exists)* | `custom.reading_time` | Integer |
| Subtitle | `custom.subtitle` | Single line text |
| Hero caption | `custom.hero_caption` | Single line text |
| Author profile | `custom.author_profile` | Metaobject → Author |
| Show contents | `custom.show_contents` | True or false |
| Number headings | `custom.number_headings` | True or false |
| Related articles | `custom.related_articles` | List of blog posts *(article references)* |

Empty always means "the sensible default": both booleans are **on unless set to false**.

**2b. Metaobject definition `article_icon`** (created 2026-09-22) — fields `name` (single line
text) and `icon` (file, any type), Storefronts access on. Entries are the uploadable icons.

**3. Library page** — Online Store → Pages → Add page "Article components", template
`article-components`. Set its `seo.hidden` metafield to `1` so it stays out of search.

## Decisions worth knowing before changing anything

- **Quote box is upright, not italic.** Tiempos Medium Italic is still the 67-glyph trial cut with
  no `’ “ ” –`, and quotes are where those live. When the licensed cut arrives, change
  `--font-quote-style` in `snippets/dev-article-tokens.liquid` to `italic`. Nothing else moves.
- **Related articles use the shared journal card at every width**, not the mockup's compact mobile
  rows — a second card would drift, and would download full-width images into thumbnails.
- **Header is left-aligned** (was centred) to sit on the prose column, as the mockup does.
- **The back links are off** in `templates/article.json` (empty label): the breadcrumb and
  "View all articles" replace them. Type a label to bring them back.
- The icons are drawn in the theme's UI-icon style (24px box, 1.4px stroke, round caps — the same
  spec as the journal CTA arrow and the FAQ chevron), not exported from Figma. Replace any one by
  swapping its `when` body in `snippets/dev-article-icon.liquid`.

## Verification so far

- `shopify theme check`: no new offences (the `blocks.email_signup.success` TranslationKeyExists hit
  is the same false positive the shipped footer carries; the JSON-comment hits match the repo's
  other templates).
- Rendered locally with liquidjs + Chromium against the client's real guest post (the `.docx`),
  a component-heavy variant, a no-metafield post and a one-paragraph post, at 375 / 1024 / 1440:
  no horizontal overflow, no console errors, shortcodes all expanded, TOC anchors match heading ids.
- **Not yet verified on the real store** (`shopify theme dev` needs a CLI login with staff access to
  `wearelarke`): real metafield/metaobject reads, `where`/`concat` on `blog.articles`, the RTE's
  exact output for shortcodes, the sticky rail inside Horizon's `.page-wrapper` scroller.

## Technical SEO (2026-09-22)

Measured on the store preview (theme 201771843931), post `sleeping-under-tree-fibre-my-5-surprises`.

| What | How | Where |
|---|---|---|
| Structured data | Own `BlogPosting` (author = page byline via Author profile, publisher + logo, image with size, section, keywords, wordCount, inLanguage, isPartOf Blog) + `BreadcrumbList`. Replaces Shopify's `structured_data`, which credited the staff account and put raw shortcodes in `articleBody`. | `sections/dev-article.liquid` |
| Meta / OG description | SEO description → excerpt → **Subtitle** → cleaned body cut at a word (no shortcodes, no mid-word cut). | `snippets/meta-tags.liquid` |
| Open Graph article tags | `article:published_time`, `modified_time`, `author`, `section`, `tag`. | `snippets/meta-tags.liquid` |
| Component library page | `noindex, follow` automatically. | `snippets/meta-tags.liquid` |
| Body images | CDN images get a srcset ladder + real `sizes`, are cropped to 3:2 on the CDN, and carry `width`/`height` → CLS 0. An image with its own width+height keeps its shape. | `snippets/dev-article-body.liquid` |
| Plain text for machines | One helper strips HTML + shortcodes for description, JSON-LD and word count. | `snippets/dev-article-plain-text.liquid` |

Lighthouse (mobile, preview): **SEO 100 · Accessibility 100 · CLS 0**. Performance 37 — but the
homepage on the same preview scores 45 with a 20 s LCP, so the ceiling is site-wide, not the blog:
Shopify's perf-kit (~2.4 s of main thread), three Google Tag Manager tags and Facebook's pixel, plus
preview-mode overhead. The hero itself passes every image audit (18 KB, fetchpriority high, not lazy,
responsive). Re-measure on the published theme with PageSpeed Insights before judging performance.

## Changes 2026-09-28 (owner's review)

| Change | Where |
|---|---|
| Breadcrumb "News › Guest Review" → "Snooze › Humble Home": first crumb = section setting **Blog name in breadcrumb** (`Snooze`); second crumb = the post's **Breadcrumb tag** field (`custom.breadcrumb_tag`, single line text — must be one of the post's tags so the crumb links to a real `/tagged/` page), else its first tag. Structured-data breadcrumb follows. | `sections/dev-article.liquid` |
| Meta separator is its own element in the full text colour (was muted, and a Hangul `ㆍ` from a fallback font; now `·` in Public Sans). Screen readers hear "5 min read, September 22, 2026". Date is a `<time datetime>`. | `sections/dev-article.liquid`, `assets/dev-article.css` |
| "In this article": no numbers in the list (body headings keep theirs); every dropdown row ends in the journal-CTA arrow. Rail (≥1280) unnumbered, no arrows. | `assets/dev-article.css` |
| Dropdown auto-closes once the whole box has been off-screen for 300 ms (down or up), instantly and with the reading position pinned (manual scroll anchoring — Safari has none). Stays closed until tapped again. | `assets/dev-article.js` |
| "Meet the real thing." product call-to-action — new section **Product call-to-action** after the article body, button to the real duvet (`natural-duvet`). | `sections/dev-article-cta.liquid`, `assets/dev-article-cta.css` |
| Closing panel ("A calmer planet sleeps brighter.") removed from the post template. The section file remains available in the theme editor. | `templates/article.json` |
| "View all articles" → "All Articles". | `templates/article.json` |
| Author card: name no longer a link; "Visit her here →" link under the bio, underlined, text colour, opens the author's site in a new tab. Wording from the author entry's **Link label** field (`link_label`), fallback = section setting. | `sections/dev-article-author.liquid`, `.css` |

Store data (admin, not code): example post's Top tip + wash-care list moved after section 4; tag
"Humble Home" + Breadcrumb tag field; author entry bio, link (https://thehumblehome.uk/) and label.

**theme-check 4.x note.** Shopify CLI 4.8 parses angle brackets inside `{% comment %}` blocks as real
tags. A comment above the TOC code that mentioned an h2 tag produced a false "closing `details` before
it was opened" error. Keep literal tag names out of comments in these files.
