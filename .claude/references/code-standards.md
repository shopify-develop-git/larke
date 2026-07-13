# Code standards — custom Shopify sections

The rules for writing `dev-` sections in a Horizon theme. Read this in full before writing a section.

These rules are **structural** and apply to any Horizon project. They contain **no brand values** on
purpose. Fonts, container width, base padding, and type scale are **parameters** that come from the
Design Brief, not constants you can find here. If you catch yourself typing a font family or a pixel
width that nobody told you, stop — you are inventing the design.

---

## Brand params — the contract with the Design Brief

Every section consumes these CSS custom properties. Their **values** come from Figma via the Design
Brief; their **names** are fixed so devs and QA agree on what to assert.

```
--font-body        body font family (+ weight)
--font-heading     heading font family (+ weight)
--container-max    max width of the inner container
--section-px       horizontal padding of the section
```

Plus the merchant-editable, per-section values, set inline on the root wrapper:

```
--bg               background colour
--color            text colour
--accent           accent colour
--pt  --pb         padding top / bottom
```

Never hardcode a colour, a font family, a container width, or a base padding. Always `var()`.

---

## Files

```
sections/dev-{name}.liquid    structure + schema
assets/dev-{name}.css         styles
assets/dev-{name}.js          only when the section is interactive
```

`{name}` is kebab-case. **Never overwrite an existing `dev-*` file** — on collision, stop and ask.

---

## Liquid

### File order — always exactly this

```liquid
{{ 'dev-{name}.css' | asset_url | stylesheet_tag }}
<script src="{{ 'dev-{name}.js' | asset_url }}" defer></script>
{%- comment -%} ↑ omit the JS line entirely if the section has no interactivity {%- endcomment -%}

{%- comment -%} Fixed design tokens from Figma — not merchant-controlled {%- endcomment -%}
<style>
  .{name} {
    --font-heading-size: {value}px;
    --font-heading-weight: {value};
    --font-heading-lh: {value};
    --font-body-size: {value}px;
    --font-body-lh: {value};
    --spacing-sm: {value}px;
    --spacing-md: {value}px;
    --spacing-lg: {value}px;
  }
</style>

<div
  class="{name}"
  style="
    --bg: {{ section.settings.background_color }};
    --color: {{ section.settings.text_color }};
    --accent: {{ section.settings.accent_color }};
    --pt: {{ section.settings.padding_top }}px;
    --pb: {{ section.settings.padding_bottom }}px;
  "
>
  {%- comment -%} content {%- endcomment -%}
</div>

{% schema %}
{ ... }
{% endschema %}
```

- CSS tag first, always.
- JS tag only when interactive — omit it completely for static sections.
- Typography tokens go in the `<style>` block: they are fixed Figma values, not merchant settings.
- Merchant-controlled values (`--bg`, `--color`, `--accent`, `--pt`, `--pb`) go inline on the root
  wrapper — never in the `<style>` block.
- Never put inline styles on inner elements. Layout and decoration live in the CSS file.

### HTML

- Semantic elements: `<section>`, `<article>`, `<h2>`, `<h3>`, `<p>`, `<ul>`, `<li>`.
- BEM: `.{name}__element`, `.{name}__element--modifier`.
- Dash tags everywhere: `{%- -%}`.
- Section heading is `<h2>`. Block heading is `<h3>`. `<h1>` belongs to the page title — never use it.
- Guard every output: `{%- if section.settings.heading != blank -%}`.

### Images — `image_tag`, never `img_url`

```liquid
{%- if block.settings.image != blank -%}
  {{
    block.settings.image
    | image_url: width: 1200
    | image_tag:
      loading: 'lazy',
      widths: '400, 600, 800, 1000, 1200',
      sizes: '(min-width: 1024px) 50vw, 100vw',
      alt: block.settings.image.alt | escape,
      class: '{name}__image'
  }}
{%- endif -%}
```

- Always `image_url` — `img_url` is deprecated and forbidden.
- Always include `alt:`. Use the image's alt; pass `''` for decorative images.
- `sizes` must reflect the width the image actually renders at, at each breakpoint.
- Always wrap in `{%- if != blank -%}`.

### Blocks

```liquid
{%- for block in section.blocks -%}
  <div class="{name}__block" {{ block.shopify_attributes }}>
    {%- if block.settings.heading != blank -%}
      <h3 class="{name}__block-heading">{{ block.settings.heading | escape }}</h3>
    {%- endif -%}
    {%- if block.settings.text != blank -%}
      <div class="{name}__block-text">{{ block.settings.text }}</div>
    {%- endif -%}
  </div>
{%- endfor -%}
```

`{{ block.shopify_attributes }}` is required on every block wrapper. Without it the theme editor
cannot select or reorder the block. Never omit it.

### Accessibility

- Every `<img>` has `alt`.
- Icon-only buttons have `aria-label`.
- Accordions / toggles manage `aria-expanded` and `aria-controls`.
- Tabs manage `aria-selected`.
- A nav inside a section uses `<nav aria-label="…">`.

### Schema

```json
{
  "name": "{Human Name}",
  "tag": "section",
  "class": "{name}",
  "presets": [
    { "name": "{Human Name}", "blocks": [ { "type": "{block_type}" }, { "type": "{block_type}" } ] }
  ],
  "settings": [
    { "type": "header", "content": "Content" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "Section heading" },

    { "type": "header", "content": "Colors" },
    { "type": "color", "id": "background_color", "label": "Background", "default": "#ffffff" },
    { "type": "color", "id": "text_color", "label": "Text color", "default": "#111111" },
    { "type": "color", "id": "accent_color", "label": "Accent color", "default": "#000000" },

    { "type": "header", "content": "Spacing" },
    { "type": "range", "id": "padding_top", "min": 0, "max": 200, "step": 4, "unit": "px", "label": "Padding top", "default": 60 },
    { "type": "range", "id": "padding_bottom", "min": 0, "max": 200, "step": 4, "unit": "px", "label": "Padding bottom", "default": 60 }
  ],
  "blocks": [
    {
      "type": "{block_type}",
      "name": "{Block Name}",
      "limit": 6,
      "settings": [
        { "type": "image_picker", "id": "image",        "label": "Image" },
        { "type": "text",         "id": "heading",      "label": "Heading", "default": "Card heading" },
        { "type": "richtext",     "id": "text",         "label": "Text" },
        { "type": "text",         "id": "button_label", "label": "Button label", "default": "Learn more" },
        { "type": "url",          "id": "button_link",  "label": "Button link" }
      ]
    }
  ],
  "max_blocks": 12
}
```

Hard rules:

- `name` and `presets.name` — human readable, no `dev-` prefix. ("Featured product", not "Dev featured product".)
- `tag` is always `"section"`. `class` is the root CSS class, no `dev-` prefix.
- `presets.blocks` — seed with the number of blocks the Figma design actually shows.
- Settings order: **Content → Colors → Spacing → Layout**.
- Every `text`, `color`, and `range` setting has a `label` and a `default`.
- `id` values: lowercase and underscores. `button_label`, not `button-label`.
- Never put layout settings inside a block; never put block content in section settings.
- Add `limit` to a block type whenever the design implies a maximum.

Setting types:

```json
{ "type": "text",         "id": "heading",         "label": "Heading",       "default": "Text" }
{ "type": "textarea",     "id": "subheading",      "label": "Subheading" }
{ "type": "richtext",     "id": "description",     "label": "Description",   "default": "<p>Text</p>" }
{ "type": "url",          "id": "button_link",     "label": "Button link" }
{ "type": "image_picker", "id": "image",           "label": "Image" }
{ "type": "video",        "id": "video",           "label": "Video" }
{ "type": "color",        "id": "background_color","label": "Background",    "default": "#ffffff" }
{ "type": "checkbox",     "id": "full_width",      "label": "Full width",    "default": false }
{ "type": "select",       "id": "layout",          "label": "Layout",        "default": "image_left",
  "options": [ { "value": "image_left", "label": "Image left" }, { "value": "image_right", "label": "Image right" } ] }
```

Resolve ambiguity with a setting, not by guessing. If the design could reasonably go either way,
give the merchant a `select`.

---

## CSS

### File structure — all six blocks, always, even if some are empty

```css
/* dev-{name}.css */

/* =============================================
   BASE — desktop
   ============================================= */

.{name} {
  background-color: var(--bg);
  color: var(--color);
  padding-top: var(--pt);
  padding-bottom: var(--pb);
  padding-left: var(--section-px);
  padding-right: var(--section-px);
  font-family: var(--font-body);
}

.{name}__inner {
  max-width: var(--container-max);
  width: 100%;
  margin-inline: auto;
}

/* --- layout --- */
/* --- blocks / children --- */
/* --- typography --- */
/* --- buttons / links --- */

/* =============================================
   TABLET  ≤ 1024px
   ============================================= */

@media (max-width: 1024px) {
}

/* =============================================
   MOBILE  ≤ 768px
   ============================================= */

@media (max-width: 768px) {
}

/* =============================================
   SMALL MOBILE  ≤ 480px
   ============================================= */

@media (max-width: 480px) {
}

/* =============================================
   ACCESSIBILITY
   ============================================= */

.{name}__button:focus-visible,
.{name}__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.{name}__button:focus:not(:focus-visible),
.{name}__link:focus:not(:focus-visible) {
  outline: none;
}

/* =============================================
   REDUCED MOTION
   ============================================= */

@media (prefers-reduced-motion: reduce) {
  .{name},
  .{name} * {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

### Layout — flex for linear sequences

```css
.{name}__blocks {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md);
}

@media (max-width: 768px) {
  .{name}__blocks { flex-direction: column; gap: var(--spacing-sm); }
}
```

### Layout — grid for equal columns

```css
.{name}__blocks {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-md);
}

@media (max-width: 1024px) { .{name}__blocks { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 480px)  { .{name}__blocks { grid-template-columns: 1fr; } }
```

Column collapse:

| Desktop | ≤ 1024px | ≤ 768px | ≤ 480px |
|---|---|---|---|
| 4 col | 3 col | 2 col | 1 col |
| 3 col | 2 col | 2 col | 1 col |
| 2 col | 2 col | 1 col | 1 col |

### Responsive type

Never a fixed `px` font-size at mobile — scale from the token:

```css
@media (max-width: 768px) { .{name}__heading { font-size: calc(var(--font-heading-size) * 0.75); } }
@media (max-width: 480px) { .{name}__heading { font-size: calc(var(--font-heading-size) * 0.65); } }
```

If the Mobile artboard specifies its own type sizes, use **those** instead of a scale factor — the
design wins over the heuristic. The factors above are a fallback for when mobile is unspecified.

### Touch targets

```css
@media (max-width: 768px) {
  .{name}__button,
  .{name}__link {
    min-height: 44px;
    min-width: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
}
```

### CSS hard rules

- Never hardcode a colour — always `var()`.
- Never hardcode a font family — always `var(--font-body)` / `var(--font-heading)`.
- Never a fixed height on a container — use `min-height` if a floor is needed.
- Never `display: none` to hide content unless the design explicitly hides it.
- No horizontal scroll at any width. Check `overflow` at 480px.
- All six structure blocks present in every file.

---

## JavaScript — only when interactive

```js
/* dev-{name}.js */

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.{name}').forEach((section) => init(section));
});

function init(section) {
  // …
}
```

Query by section class so multiple instances on one page each work. No jQuery, no libraries. No
`var`. Delegate events on the section root rather than binding each element.

### Accordion

```js
function init(section) {
  section.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-accordion-trigger]');
    if (!trigger) return;

    const item = trigger.closest('[data-accordion-item]');
    const panel = item.querySelector('[data-accordion-panel]');
    const isOpen = item.dataset.open === 'true';

    section.querySelectorAll('[data-accordion-item]').forEach((el) => {
      el.dataset.open = 'false';
      el.querySelector('[data-accordion-panel]').hidden = true;
      el.querySelector('[data-accordion-trigger]').setAttribute('aria-expanded', 'false');
    });

    item.dataset.open = isOpen ? 'false' : 'true';
    panel.hidden = isOpen;
    trigger.setAttribute('aria-expanded', String(!isOpen));
  });
}
```

Markup needs: `data-accordion-item` on the wrapper, `data-accordion-trigger` on the heading,
`data-accordion-panel` on the content, `aria-expanded="false"` on the trigger, `hidden` on the panel.

### Slider

```js
function init(section) {
  const track = section.querySelector('[data-slider-track]');
  const slides = section.querySelectorAll('[data-slide]');
  const prev = section.querySelector('[data-slider-prev]');
  const next = section.querySelector('[data-slider-next]');
  let current = 0;

  if (!track || slides.length < 2) return;

  function goTo(index) {
    current = (index + slides.length) % slides.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    slides.forEach((s, i) => { s.dataset.slideActive = String(i === current); });
    section.querySelectorAll('[data-dot]').forEach((dot, i) => {
      dot.setAttribute('aria-current', i === current ? 'true' : 'false');
    });
  }

  prev?.addEventListener('click', () => goTo(current - 1));
  next?.addEventListener('click', () => goTo(current + 1));

  section.addEventListener('click', (e) => {
    const dot = e.target.closest('[data-dot]');
    if (dot) goTo(Number(dot.dataset.dot));
  });

  let startX = 0;
  track.addEventListener('touchstart', (e) => { startX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', (e) => {
    const delta = startX - e.changedTouches[0].clientX;
    if (Math.abs(delta) > 50) goTo(delta > 0 ? current + 1 : current - 1);
  });

  goTo(0);
}
```

Sliders must handle touch swipe. A slider that only works with arrows is broken on the device most
people will use.

### Tabs

```js
function init(section) {
  const tabs = section.querySelectorAll('[data-tab]');
  const panels = section.querySelectorAll('[data-tab-panel]');

  section.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;
    const target = tab.dataset.tab;
    tabs.forEach((t) => {
      const active = t.dataset.tab === target;
      t.setAttribute('aria-selected', String(active));
      t.dataset.active = String(active);
    });
    panels.forEach((p) => { p.hidden = p.dataset.tabPanel !== target; });
  });

  tabs[0]?.click();
}
```

### Scroll reveal

```js
function init(section) {
  const targets = section.querySelectorAll('[data-reveal]');
  if (!targets.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.dataset.revealed = 'true';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  targets.forEach((el) => observer.observe(el));
}
```

```css
[data-reveal] { opacity: 0; transform: translateY(20px); transition: opacity .4s, transform .4s; }
[data-reveal][data-revealed] { opacity: 1; transform: none; }
```

### JS hard rules

- Guard every lookup: `if (!el) return;`
- Manage `aria-expanded` on toggles, `aria-selected` on tabs.
- Use the `hidden` attribute on panels, not just `display: none`.
- Never inject untrusted content with `innerHTML`.
