# FAQ Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `dev-faq` section and a `page.faq` template so `/pages/faq` renders the store's two real FAQs as an accordion in the site's own visual language.

**Architecture:** A custom Horizon section (`sections/dev-faq.liquid` + `assets/dev-faq.css` + `assets/dev-faq.js`) whose questions are schema blocks, driven by `templates/page.faq.json`. The accordion is `<details>`/`<summary>` — it works with no JS — and the JS only upgrades it with an animated height and one-open-at-a-time behaviour, carried over from `dev-main-product`. The template is an alternate template, so a final step assigns it to the FAQ page in the Shopify admin through the Chrome extension.

**Tech Stack:** Shopify Horizon 4.1.1, Liquid, plain CSS and JS served straight from `assets/` (no build step).

## Global Constraints

Copied from `.claude/references/code-standards.md`, `CLAUDE.md` and the spec. Every task's requirements implicitly include this section.

- **Never run `shopify theme push`.** Never modify any remote theme. Work only against `shopify theme dev --store wearelarke` on `:9292`.
- **No API keys, no tokens, no `.env`.** Anything touching the store goes through the Chrome extension in the already-logged-in browser.
- **Never overwrite an existing `dev-*` file.** `sections/dev-faq.liquid`, `assets/dev-faq.css` and `assets/dev-faq.js` do not exist — verified. On any collision, stop and ask.
- Exactly three files per section. **No shared asset with `dev-main-product`** — the ~40 lines of accordion JS are duplicated on purpose.
- BEM, `dev-`prefixed: `.dev-faq__element--modifier`. The prefix is load-bearing — Horizon compiles every stock section's `{% stylesheet %}` into a sheet that loads on **every** page, so an unprefixed name inherits stock rules.
- Never hardcode a colour, font family, container width or base padding — always `var()`. Merchant values arrive as `--bg`, `--color`, `--accent`, `--pt`, `--pb` set inline on the root wrapper.
- Brand params, fixed, in the section's `<style>` block: `--font-body: 'Public Sans', sans-serif`, `--font-heading: 'Test Tiempos Headline', serif`.
- `--container-max: 944px` — the width of the `Accordions - Desktop` artboard (`45068:1975`). This is the one measured value the section takes from Figma.
- Breakpoints: 1024, 768, 480.
- `<h2>` for the section heading, `<h3>` for a block heading. `{{ block.shopify_attributes }}` on every block wrapper.
- Schema settings order: Content → Colors → Spacing → Layout. Preset name is clean and human (`FAQ`), never prefixed "Dev".
- `{%- -%}` dash tags for whitespace control.
- There is no test runner in this repo. Validation is `shopify theme check` plus rendering assertions against the dev server.

**Content — verbatim, do not paraphrase.** Two questions, with the two corrections the spec authorises and nothing else:

1. Q: `How soon will my order arrive?` (live heading is truncated at "How soon will"; completed)
   A: `We aim to have all orders dispatched on the same day when placed by 4 p.m on weekdays. The free standard delivery usually arrives within 3-5 days once dispatched. The local delivery option will arrive the same day if received before 4pm or the next day if ordered after 4pm`
   (verbatim except `usually arrived` → `usually arrives`)
2. Q: `How much does delivery cost?` (question mark added)
   A: `Delivery within UK Mainland is always free. We do also offer an express local delivery option for any postcode within a 5 mile radius of Larke HQ`

---

### Task 1: The section renders, with no JS

**Files:**
- Create: `sections/dev-faq.liquid`
- Create: `assets/dev-faq.css`
- Create: `templates/page.faq.json`

**Interfaces:**
- Consumes: nothing.
- Produces: the root wrapper `<div class="dev-faq" data-faq>`; the accordion group `<div class="dev-faq__list" data-faq-group>`; one row per block `<details class="dev-faq__item" data-faq-item>` with a `<summary>` inside it. Task 2's JS binds to `[data-faq]`, `[data-faq-group]` and `[data-faq-item]`, and to the `--acc-dur` / `--acc-ease` tokens declared here. Task 3 appends a JSON-LD block to this same file.

- [ ] **Step 1: Confirm no file is about to be overwritten**

Run:
```bash
cd /Users/mynenkoyevhenii/Documents/EVDEV/Github/larke
ls sections/dev-faq.liquid assets/dev-faq.css assets/dev-faq.js templates/page.faq.json 2>&1
```
Expected: `No such file or directory` for all four. If any exists — **stop and ask.**

- [ ] **Step 2: Create `sections/dev-faq.liquid`**

```liquid
{{ 'dev-faq.css' | asset_url | stylesheet_tag }}
<script src="{{ 'dev-faq.js' | asset_url }}" defer></script>

{%- comment -%}
  Section: "FAQ" (dev name `faq`). Page: /pages/faq.

  THERE IS NO FAQ ARTBOARD. The Figma file has Homepage, Our Story, Tree-Fibre, Contact, Delivery,
  Shipping and PDP — and no FAQ. So this section is not pixel-verified against a reference the way
  its siblings were, and nobody should go looking for the mock that "must" exist.

  What it is instead: the accordion from `Accordions - Desktop` (45068:1975), the component already
  built into dev-main-product, reused so the page reads as part of the site. Its 944px width is the
  one measured value taken from Figma here.

  The rows are <details>/<summary>, not a div plus a click handler. They open with no JS, they are
  keyboard operable and announced correctly by screen readers for free, and Ctrl+F on the page can
  still find the text inside a closed panel. dev-faq.js only upgrades them.

  The ~40 lines of accordion JS are duplicated from dev-main-product rather than shared. The
  standard is three files per section; coupling two sections through a shared asset to save forty
  lines would cost more than the duplication does.
{%- endcomment -%}

{%- comment -%} Fixed design tokens — not merchant-controlled {%- endcomment -%}
<style>
  .dev-faq {
    --font-body: 'Public Sans', sans-serif;
    --font-heading: 'Test Tiempos Headline', serif;

    /* The width of the Accordions - Desktop artboard (45068:1975). A question is a line of prose:
       run it to the 1312px page container and it becomes a hard read. */
    --container-max: 944px;
    --section-px: 64px;
    --section-px-mobile: 16px;

    --font-heading-size: 32px;
    --font-heading-size-mobile: 24px;
    /* Desktop/Title 4 — the same step the PDP's accordion headings sit on. */
    --font-question-size: 22px;
    --font-heading-weight: 500;
    --font-heading-lh: 1.2;

    --font-answer-size: 18px;
    --font-answer-size-mobile: 16px;
    --font-body-lh: 1.4;
    --w-medium: 500;

    --head-gap: 40px;
    --icon-size: 24px;

    /* 24px on the artboard, in three places: under the divider, between question and answer, and
       between one row's answer and the next divider. */
    --acc-gap: 24px;

    /* One curve for the accordion, both directions — opening on one curve and closing on another
       looks restless when a row closes while its neighbour opens. The JS reads --acc-dur back out
       of here (parseFloat on the computed value), so keep it in ms. */
    --acc-dur: 300ms;
    --acc-ease: cubic-bezier(0.32, 0.72, 0, 1);
  }
</style>

<div
  class="dev-faq"
  style="
    --bg: {{ section.settings.background_color }};
    --color: {{ section.settings.text_color }};
    --accent: {{ section.settings.accent_color }};
    --border-color: {{ section.settings.border_color }};
    --pt: {{ section.settings.padding_top }}px;
    --pb: {{ section.settings.padding_bottom }}px;
  "
  data-faq
>
  <div class="dev-faq__inner">
    {%- if section.settings.heading != blank or section.settings.subheading != blank -%}
      <div class="dev-faq__head">
        {%- if section.settings.heading != blank -%}
          <h2 class="dev-faq__heading">{{ section.settings.heading }}</h2>
        {%- endif -%}

        {%- if section.settings.subheading != blank -%}
          <p class="dev-faq__subheading">{{ section.settings.subheading }}</p>
        {%- endif -%}
      </div>
    {%- endif -%}

    {%- assign questions = section.blocks | where: 'type', 'question' -%}
    {%- if questions.size > 0 -%}
      <div class="dev-faq__list" data-faq-group>
        {%- for block in questions -%}
          <details
            class="dev-faq__item"
            data-faq-item
            {% if block.settings.open_by_default %}open{% endif %}
            {{ block.shopify_attributes }}
          >
            <summary class="dev-faq__summary">
              <h3 class="dev-faq__question">{{ block.settings.heading | escape }}</h3>
              <span class="dev-faq__icon" aria-hidden="true">
                {%- comment -%} One glyph, rotated when the row opens — a second SVG would be the same path drawn twice. {%- endcomment -%}
                <svg class="dev-faq__chevron" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" focusable="false">
                  <path d="M19 9L12 16L5 9" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </span>
            </summary>

            {%- if block.settings.body != blank -%}
              <div class="dev-faq__answer">{{ block.settings.body }}</div>
            {%- endif -%}
          </details>
        {%- endfor -%}
      </div>
    {%- endif -%}
  </div>
</div>

{% schema %}
{
  "name": "FAQ",
  "tag": "section",
  "settings": [
    { "type": "header", "content": "Content" },
    { "type": "inline_richtext", "id": "heading", "label": "Heading", "default": "Frequently Asked Questions" },
    { "type": "text", "id": "subheading", "label": "Subheading" },

    { "type": "header", "content": "Colors" },
    {
      "type": "color",
      "id": "background_color",
      "label": "Background",
      "info": "Transparent by default — the section inherits the page canvas.",
      "default": "rgba(0,0,0,0)"
    },
    { "type": "color", "id": "text_color", "label": "Text color", "default": "#333333" },
    { "type": "color", "id": "accent_color", "label": "Accent", "default": "#4EA448" },
    { "type": "color", "id": "border_color", "label": "Divider", "default": "#C4BCA9" },

    { "type": "header", "content": "Spacing" },
    { "type": "range", "id": "padding_top", "min": 0, "max": 160, "step": 4, "unit": "px", "label": "Padding top", "default": 80 },
    { "type": "range", "id": "padding_bottom", "min": 0, "max": 160, "step": 4, "unit": "px", "label": "Padding bottom", "default": 80 }
  ],
  "blocks": [
    {
      "type": "question",
      "name": "Question",
      "settings": [
        { "type": "text", "id": "heading", "label": "Question" },
        { "type": "richtext", "id": "body", "label": "Answer" },
        { "type": "checkbox", "id": "open_by_default", "label": "Open by default", "default": false }
      ]
    }
  ],
  "presets": [
    {
      "name": "FAQ",
      "blocks": [
        { "type": "question", "settings": { "heading": "How soon will my order arrive?" } },
        { "type": "question", "settings": { "heading": "How much does delivery cost?" } }
      ]
    }
  ]
}
{% endschema %}
```

- [ ] **Step 3: Create `assets/dev-faq.css`**

```css
/* FAQ. No artboard exists for this section — see the note in dev-faq.liquid. The accordion follows
   `Accordions - Desktop` (45068:1975), which is also what dev-main-product's rows follow. */

.dev-faq {
  padding: var(--pt) var(--section-px) var(--pb);
  background-color: var(--bg);
  color: var(--color);
  font-family: var(--font-body);
}

.dev-faq__inner {
  max-width: var(--container-max);
  margin: 0 auto;
}

.dev-faq__head {
  margin-bottom: var(--head-gap);
  text-align: center;
}

.dev-faq__heading {
  margin: 0;
  font-family: var(--font-heading);
  font-size: var(--font-heading-size);
  font-weight: var(--font-heading-weight);
  line-height: var(--font-heading-lh);
}

.dev-faq__subheading {
  margin: 8px 0 0;
  font-size: var(--font-answer-size);
  font-weight: var(--w-medium);
  line-height: var(--font-body-lh);
}

/* The gap belongs BETWEEN the rows, not as padding inside them — so the last row carries no
   trailing space. Same construction as the PDP's accordion. */
.dev-faq__list {
  display: flex;
  flex-direction: column;
  gap: var(--acc-gap);
}

.dev-faq__item {
  padding-top: var(--acc-gap);
  border-top: 1px solid var(--border-color);
}

/* The last row closes the list off — the artboard's rows sit between rules, not above them. */
.dev-faq__item:last-child {
  padding-bottom: var(--acc-gap);
  border-bottom: 1px solid var(--border-color);
}

/* `padding: 0` is load-bearing. Horizon's base.css carries a BARE `summary { padding: var(--padding-sm) }`
   and it loads on every page, so it lands on these rows and nothing else in this file refuses it.
   A dev-prefixed class does not protect against an element selector. */
.dev-faq__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0;
  cursor: pointer;
  list-style: none;
}

/* Safari draws its own disclosure triangle through ::-webkit-details-marker and ignores
   `list-style: none`. Both rules are needed, or the chevron sits next to a stray arrow. */
.dev-faq__summary::-webkit-details-marker {
  display: none;
}

.dev-faq__summary:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 4px;
}

.dev-faq__question {
  flex: 1 1 0;
  min-width: 0;
  margin: 0;
  font-family: var(--font-heading);
  font-size: var(--font-question-size);
  font-weight: var(--font-heading-weight);
  line-height: var(--font-heading-lh);
}

.dev-faq__icon {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
}

.dev-faq__chevron {
  display: block;
  width: var(--icon-size);
  height: var(--icon-size);
  transition: transform var(--acc-dur) var(--acc-ease);
}

.dev-faq__item[open] .dev-faq__chevron {
  transform: rotate(180deg);
}

/* A closing row keeps [open] until its height animation lands — the content has to stay in the DOM
   to be animated out of — so the chevron must be told to turn back NOW, not at the end. Same
   specificity as the rule above: it wins on source order, so it must stay below it. */
.dev-faq__item[data-faq-state='closing'] .dev-faq__chevron {
  transform: none;
}

.dev-faq__answer {
  padding-top: var(--acc-gap);
  font-size: var(--font-answer-size);
  font-weight: var(--w-medium);
  line-height: var(--font-body-lh);
}

.dev-faq__answer p {
  margin: 0;
}

.dev-faq__answer p + p {
  margin-top: 12px;
}

.dev-faq__answer a {
  color: inherit;
  text-decoration: underline;
}

/* The answer fades up out of nothing as the row opens — opacity ONLY. The row is already growing
   underneath it; a slide as well would be two movements fighting over the same text. Closing has no
   rule at all: the shrinking row clips the copy away from the bottom, which is already the gesture. */
.dev-faq__item[data-faq-state='opening'] > :not(summary) {
  animation: dev-faq-in calc(var(--acc-dur) * 0.75) var(--acc-ease) both;
}

@keyframes dev-faq-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@media (max-width: 768px) {
  .dev-faq {
    padding-right: var(--section-px-mobile);
    padding-left: var(--section-px-mobile);
  }

  /* Override the PROPERTY, not the token: the tokens live in an inline <style> block, which media
     queries in this file cannot outrank. */
  .dev-faq__heading {
    font-size: var(--font-heading-size-mobile);
  }

  .dev-faq__question {
    font-size: var(--font-answer-size);
  }

  .dev-faq__answer,
  .dev-faq__subheading {
    font-size: var(--font-answer-size-mobile);
  }
}

@media (prefers-reduced-motion: reduce) {
  .dev-faq__chevron {
    transition: none;
  }

  /* The JS drops the height animation to 0ms on its own; this kills the answer's fade to match. */
  .dev-faq__item[data-faq-state] > :not(summary) {
    animation: none;
  }
}
```

- [ ] **Step 4: Create `templates/page.faq.json`**

```json
{
  "sections": {
    "faq": {
      "type": "dev-faq",
      "blocks": {
        "q_delivery_time": {
          "type": "question",
          "settings": {
            "heading": "How soon will my order arrive?",
            "body": "<p>We aim to have all orders dispatched on the same day when placed by 4 p.m on weekdays. The free standard delivery usually arrives within 3-5 days once dispatched. The local delivery option will arrive the same day if received before 4pm or the next day if ordered after 4pm</p>",
            "open_by_default": true
          }
        },
        "q_delivery_cost": {
          "type": "question",
          "settings": {
            "heading": "How much does delivery cost?",
            "body": "<p>Delivery within UK Mainland is always free. We do also offer an express local delivery option for any postcode within a 5 mile radius of Larke HQ</p>",
            "open_by_default": false
          }
        }
      },
      "block_order": [
        "q_delivery_time",
        "q_delivery_cost"
      ],
      "settings": {
        "heading": "Frequently Asked Questions",
        "background_color": "rgba(0,0,0,0)",
        "text_color": "#333333",
        "accent_color": "#4EA448",
        "border_color": "#C4BCA9",
        "padding_top": 80,
        "padding_bottom": 80
      }
    }
  },
  "order": [
    "faq"
  ]
}
```

- [ ] **Step 5: Lint**

Run:
```bash
cd /Users/mynenkoyevhenii/Documents/EVDEV/Github/larke
shopify theme check 2>&1 | grep -iE 'dev-faq|page\.faq'
```
Expected: no output — no offence names either file.

- [ ] **Step 6: Verify it renders, and that both questions are on the page**

The dev server must be running (`shopify theme dev --store wearelarke`). The template is an alternate template and is not yet assigned to the page, so it is reached with `?view=faq`.

Run:
```bash
curl -s --max-time 30 "http://127.0.0.1:9292/pages/faq?view=faq" \
  | grep -oE 'dev-faq__(question|answer)|How soon will my order arrive\?|How much does delivery cost\?'
```
Expected: both question strings, and `dev-faq__question` / `dev-faq__answer` classes present.

- [ ] **Step 7: Commit**

```bash
cd /Users/mynenkoyevhenii/Documents/EVDEV/Github/larke
git add sections/dev-faq.liquid assets/dev-faq.css templates/page.faq.json
git commit -m "feat(faq): add the dev-faq section and its page template"
```

---

### Task 2: The accordion animates, one row at a time

**Files:**
- Create: `assets/dev-faq.js`

**Interfaces:**
- Consumes: `[data-faq]` (root), `[data-faq-group]` (the list), `[data-faq-item]` (each `<details>`), and the `--acc-dur` / `--acc-ease` tokens — all produced by Task 1. It sets `data-faq-state="opening" | "closing"` on a row, which the CSS from Task 1 already styles.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Create `assets/dev-faq.js`**

This is `dev-main-product.js`'s accordion, renamed to this section's namespace. The duplication is the deliberate call recorded in the plan header.

```js
/* FAQ accordion. Duplicated from dev-main-product.js on purpose — see the note in dev-faq.liquid. */
(function () {
  // Height is animated with the Web Animations API rather than a CSS transition, because there is
  // nothing to transition BETWEEN: <details> has no intermediate height. It is `auto` or it is the
  // summary, and `auto` is not an animatable value. So each open measures the real end height and
  // animates to it in pixels, then hands the element back to `auto` — a row whose content reflows
  // (a font landing, an image loading) is never left frozen at a stale pixel height.
  const running = new WeakMap();

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-faq]').forEach((root) => init(root));
  });

  function init(root) {
    root.querySelectorAll('[data-faq-group]').forEach((group) => {
      const items = Array.from(group.querySelectorAll('[data-faq-item]'));
      if (items.length === 0) return;

      items.forEach((details) => {
        const summary = details.querySelector('summary');
        if (!summary) return;

        summary.addEventListener('click', (event) => {
          // The browser's own toggle is instant and unstoppable. Take it over: we open and close.
          event.preventDefault();

          if (isOpen(details)) {
            collapse(details);
            return;
          }

          // One row at a time. Whatever is open closes on the way — collapsed with the same
          // animation as a click on its own summary, not slammed shut.
          items.forEach((other) => {
            if (other !== details && isOpen(other)) collapse(other);
          });

          expand(details);
        });
      });
    });
  }

  // A row that is mid-collapse still carries `open` — the content has to stay in the DOM to be
  // animated out of. Reading `.open` alone would call a click on a closing row "close it again",
  // and the row would never come back. What the user sees is what counts: a closing row is closed.
  function isOpen(details) {
    return details.open && details.dataset.faqState !== 'closing';
  }

  function expand(details) {
    const from = current(details);
    stop(details);

    details.open = true;
    details.dataset.faqState = 'opening';

    // Read the natural height while nothing is pinning it. This is the only honest measurement:
    // scrollHeight excludes the border, and the row is border-box.
    const to = details.getBoundingClientRect().height;

    animate(details, from, to, () => {
      delete details.dataset.faqState;
    });
  }

  function collapse(details) {
    const from = current(details);
    stop(details);

    details.dataset.faqState = 'closing';

    animate(details, from, closedHeight(details), () => {
      // .open comes off only at the END. It is what keeps the content in the DOM to be animated out
      // of — drop it up front and the row would vanish and then politely animate an empty box.
      details.open = false;
      delete details.dataset.faqState;
    });
  }

  function animate(details, from, to, done) {
    // overflow: hidden does the clipping while the box is shorter than its content. It is set
    // inline and cleared on landing, so an open row can still overflow naturally if it must.
    details.style.overflow = 'hidden';

    const anim = details.animate(
      { height: [from + 'px', to + 'px'] },
      { duration: duration(details), easing: easing(details) }
    );

    running.set(details, anim);

    anim.addEventListener('finish', () => {
      running.delete(details);
      details.style.overflow = '';
      details.style.height = '';
      done();
    });
  }

  // Cancel any animation still in flight, having already read the height it had reached. Without
  // this, a fast second click animates from the row's resting height and the panel visibly snaps
  // back before it starts moving.
  function stop(details) {
    const anim = running.get(details);
    if (!anim) return;
    anim.cancel();
    running.delete(details);
  }

  function current(details) {
    return details.getBoundingClientRect().height;
  }

  // The row at rest: summary, plus the row's own padding and borders. Everything else is content.
  function closedHeight(details) {
    const summary = details.querySelector('summary');
    const styles = window.getComputedStyle(details);

    return (
      summary.getBoundingClientRect().height +
      parseFloat(styles.paddingTop) +
      parseFloat(styles.paddingBottom) +
      parseFloat(styles.borderTopWidth) +
      parseFloat(styles.borderBottomWidth)
    );
  }

  // The duration and the curve live in the section's token block, so the height animation here and
  // the answer's fade in the CSS cannot drift apart.
  function duration(details) {
    if (prefersReducedMotion()) return 0;
    return parseFloat(window.getComputedStyle(details).getPropertyValue('--acc-dur')) || 300;
  }

  function easing(details) {
    return window.getComputedStyle(details).getPropertyValue('--acc-ease').trim() || 'ease';
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
})();
```

- [ ] **Step 2: Lint**

Run:
```bash
cd /Users/mynenkoyevhenii/Documents/EVDEV/Github/larke
shopify theme check 2>&1 | grep -iE 'dev-faq'
```
Expected: no output.

- [ ] **Step 3: Verify the script is wired to the page**

Run:
```bash
curl -s --max-time 30 "http://127.0.0.1:9292/pages/faq?view=faq" | grep -o 'dev-faq\.js[^"]*'
```
Expected: one match — the asset URL of `dev-faq.js`, emitted by the `<script defer>` tag.

- [ ] **Step 4: Verify the behaviour in a real browser**

Use the **Chrome extension** (`mcp__claude-in-chrome__*`), per `CLAUDE.md` and the `chrome-yevhenii` skill. Playwright and headless browsers are off-limits.

Open `http://127.0.0.1:9292/pages/faq?view=faq` in a new tab, then check:
1. Row 1 is open on load (`open_by_default: true`), row 2 is closed.
2. Clicking row 2's question opens it **and closes row 1** — one at a time.
3. Clicking an open row's question closes it.
4. Keyboard: Tab reaches each `<summary>`, a visible focus ring appears, Enter toggles the row.

Note: the extension's tab is **hidden**, so CSS animations do not run there — assert the *end states* (which row is open, which is closed), not the motion.

- [ ] **Step 5: Commit**

```bash
cd /Users/mynenkoyevhenii/Documents/EVDEV/Github/larke
git add assets/dev-faq.js
git commit -m "feat(faq): animate the accordion, one row open at a time"
```

---

### Task 3: FAQPage structured data

**Files:**
- Modify: `sections/dev-faq.liquid` — append after the closing `</div>` of the root wrapper, before `{% schema %}`.

**Interfaces:**
- Consumes: the `questions` array assigned in Task 1 — re-derived here, since Liquid's `assign` from inside the markup block is still in scope in the same template.
- Produces: nothing consumed by a later task.

- [ ] **Step 1: Append the JSON-LD block to `sections/dev-faq.liquid`**

Insert between the root wrapper's closing `</div>` and `{% schema %}`:

```liquid
{%- comment -%}
  schema.org/FAQPage, built from the same blocks the section renders — so the structured data cannot
  drift from what is on the page. `strip_html` on the answer because the spec wants text, not markup;
  `json` on both because a merchant's apostrophe would otherwise break the document.
{%- endcomment -%}
{%- if questions.size > 0 -%}
  <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {%- for block in questions -%}
          {
            "@type": "Question",
            "name": {{ block.settings.heading | strip_html | json }},
            "acceptedAnswer": {
              "@type": "Answer",
              "text": {{ block.settings.body | strip_html | strip_newlines | json }}
            }
          }{% unless forloop.last %},{% endunless %}
        {%- endfor -%}
      ]
    }
  </script>
{%- endif -%}
```

- [ ] **Step 2: Verify the emitted JSON-LD is valid JSON and holds both questions**

Run:
```bash
cd /Users/mynenkoyevhenii/Documents/EVDEV/Github/larke
curl -s --max-time 30 "http://127.0.0.1:9292/pages/faq?view=faq" \
  | python3 -c "
import sys, re, json
html = sys.stdin.read()
m = re.search(r'<script type=\"application/ld\+json\">(.*?)</script>', html, re.S)
assert m, 'no JSON-LD block found'
data = json.loads(m.group(1))
assert data['@type'] == 'FAQPage', data['@type']
names = [q['name'] for q in data['mainEntity']]
print('valid JSON-LD, FAQPage,', len(names), 'questions:')
for n in names: print('  -', n)
"
```
Expected: `valid JSON-LD, FAQPage, 2 questions:` followed by both question strings. A `json.JSONDecodeError` here means a quote or newline escaped the encoder — fix the Liquid, do not hand-escape the content.

Caution: the page also carries Horizon's own JSON-LD. If the regex matches the wrong block, tighten it to the one containing `FAQPage`.

- [ ] **Step 3: Lint**

Run:
```bash
shopify theme check 2>&1 | grep -iE 'dev-faq'
```
Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /Users/mynenkoyevhenii/Documents/EVDEV/Github/larke
git add sections/dev-faq.liquid
git commit -m "feat(faq): emit FAQPage JSON-LD from the question blocks"
```

---

### Task 4: Assign the template to the FAQ page

No code. This is the step that makes the clean `/pages/faq` serve the section — until it runs, only `?view=faq` does.

**Files:** none.

**Interfaces:**
- Consumes: `templates/page.faq.json`, which the dev server must already be serving (Task 1).
- Produces: nothing.

- [ ] **Step 1: Assign the template in the Shopify admin**

Through the **Chrome extension** — there is no Admin API token in this project and there never will be. Follow the `shopify-admin-browser` skill.

1. Open `https://admin.shopify.com/store/wearelarke/pages`.
2. Open the **FAQ** page.
3. In the right-hand sidebar, under **Online store** → **Theme template**, choose `faq`.
4. Save.

The `faq` option appears in that dropdown only because the dev server is running and serving `templates/page.faq.json`. If it is absent, the dev server is not up — start it, reload the admin page, and try again.

- [ ] **Step 2: Verify the clean URL now renders the section**

Run:
```bash
cd /Users/mynenkoyevhenii/Documents/EVDEV/Github/larke
curl -s -o /dev/null -w "%{http_code}\n" --max-time 30 "http://127.0.0.1:9292/pages/faq"
curl -s --max-time 30 "http://127.0.0.1:9292/pages/faq" \
  | grep -oE 'How soon will my order arrive\?|How much does delivery cost\?'
```
Expected: `200`, then both question strings — **without** the `?view=faq` parameter.

- [ ] **Step 3: Verify the site's existing links land on it**

The header and the footer already point at `/pages/faq`; nothing about them changes. Confirm they still resolve:

```bash
curl -s --max-time 30 "http://127.0.0.1:9292/" | grep -o 'href="/pages/faq"' | head -1
```
Expected: one match.

- [ ] **Step 4: Document the section**

Dispatch the `scribe` agent to write `docs/sections/dev-faq.md` and update `docs/IMPLEMENTATION.md`, reading the actual shipped files. It must record the two facts a future reader will otherwise get wrong: there is no Figma artboard for this section, and the accordion JS is duplicated from `dev-main-product` on purpose.

- [ ] **Step 5: Commit**

```bash
cd /Users/mynenkoyevhenii/Documents/EVDEV/Github/larke
git add docs/
git commit -m "docs(faq): document the FAQ section"
```

---

## Self-review

**Spec coverage.** Three files plus template — Task 1 and 2. Accordion reused from `dev-main-product` with its own namespace and no shared asset — Task 2. Blocks, not hardcoded questions — Task 1. Schema order and clean preset name — Task 1. Brand params via `var()`, `--container-max: 944px` from `45068:1975` — Task 1. Both questions with exactly the two authorised corrections — Global Constraints and Task 1 Step 4. FAQPage JSON-LD — Task 3. Admin assignment via the Chrome extension, clean `/pages/faq` — Task 4. Verification (`?view=faq` preview, keyboard, no-JS fallback, `shopify theme check`) — Tasks 1–4. Out of scope (new copy, categories, search) — nothing in the plan adds any.

**No-JS fallback** is stated in the spec's verification list but has no step of its own. It needs none: the rows are `<details>`, and Task 2's JS only binds click handlers on top. Task 1 Step 6 verifies the markup renders and both answers are in the DOM before `dev-faq.js` exists at all — which *is* the no-JS state.

**Type consistency.** `data-faq` / `data-faq-group` / `data-faq-item` and `data-faq-state` are used identically in the Liquid (Task 1), the CSS (Task 1) and the JS (Task 2). `--acc-dur` and `--acc-ease` are declared in Task 1's `<style>` and read by name in Task 2's `duration()` and `easing()`. Block type is `question` in the schema, the preset, the template and the `where:` filter. The `questions` variable is assigned in Task 1 and reused in Task 3.
