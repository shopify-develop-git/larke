# Compare popup — metaobject/metafield migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the "How we compare" popup off hardcoded Liquid arrays onto Shopify metaobjects + a product metafield, so the comparison data is merchant-editable — mirroring how the size/season guides already work.

**Architecture:** Three store-defined metaobjects in a parent→list→child chain (`compare` → `compare_competitor` → `compare_row`), referenced from the product via a `larke.compare` metaobject-reference metafield — the exact shape of `product.metafields.larke.size_guide`. `dev-compare.liquid` is rewired to loop the metaobject instead of the hardcoded arrays; the toggle tabs and panels become data-driven, so a competitor appears only once its entry exists (this also retires the Roa/Piglet "empty panel" state). `dev-compare.css`/`.js` are unchanged — the JS already handles N competitors.

**Tech Stack:** Shopify Horizon theme (Liquid), Shopify metaobjects/metafields, the Claude-in-Chrome extension driving admin.shopify.com (per the `shopify-admin-browser` skill). No API tokens, no theme push.

## Global Constraints

- **Never** run `shopify theme push` or touch any remote theme. All theme work is local `shopify theme dev`; verify by `curl http://localhost:9292/...` and the browser.
- **No API tokens / no `.env`.** Every admin action goes through the Chrome extension, following the `shopify-admin-browser` skill: after each `navigate` wait ~2.5–3s; never coordinate-type into fields — `find` then `form_input(ref, value)`; open a file picker in a **separate** call; wait ~2s before Save; verify every step with a screenshot.
- **The extension's `file_upload` is broken** — logos go into Shopify Files via **Upload from URL**, never drag-drop. See memory `chrome-extension-file-upload-broken`.
- **Store handle:** `wearelarke`. **Product under test:** `natural-duvet`.
- **Metaobject field API types:** `single_line_text_field`, `file_reference`, `metaobject_reference`, `list.metaobject_reference`.
- **Atomic swap:** the hardcoded modal must keep working until Task 6 verifies the metaobject render; the hardcode is removed in that same task, not before.
- **Roa/Piglet** logos + values are not yet supplied. This plan fully migrates **Simba** (the designed matchup) and leaves Roa/Piglet as a documented follow-up (Task 8) — the data-driven loop makes adding them zero-code.

---

## File / entity structure

**Store (created via the extension, do not live in the repo):**
- Metaobject definition `compare_row` — fields: `label`, `larke_value`, `larke_badge`, `competitor_value` (all `single_line_text_field`).
- Metaobject definition `compare_competitor` — fields: `name` (`single_line_text_field`, display name), `logo` (`file_reference`), `footnote` (`single_line_text_field`), `rows` (`list.metaobject_reference` → `compare_row`).
- Metaobject definition `compare` — fields: `title` (`single_line_text_field`, display name), `competitors` (`list.metaobject_reference` → `compare_competitor`).
- Product metafield `larke.compare` — type `metaobject_reference` → `compare`.
- Shopify Files: `dev-compare-logo-simba.svg` (Roa/Piglet later).

**Repo:**
- Modify: `sections/dev-compare.liquid` — swap hardcoded arrays for the metaobject loop; guard on the metafield; move CSS/JS/`<style>` inside the guard.
- Unchanged: `assets/dev-compare.css`, `assets/dev-compare.js`, `assets/dev-compare-logo-larke.svg` (Larke brand logo stays a theme asset).
- `assets/dev-compare-logo-simba.svg` — kept in the repo as the source for the Files upload; unreferenced by Liquid after the swap (harmless).

**Canonical Simba data** (used verbatim in Task 4):

| row | label | larke_value | larke_badge | competitor_value |
|---|---|---|---|---|
| 1 | Filling | 100% tree-fibre | Plastic-free | Recycled PET plastic bottles |
| 2 | Free Trial | 60 nights | Twice the trial | 30 nights |
| 3 | Warranty | 5 years | +3 years | 2 years |
| 4 | Price | £120 | £20 cheaper | £140 |

Competitor: name `Simba`, footnote `As compared to the Simba hybrid, valid as of 2026*`, logo = the Files SVG from Task 3.

---

### Task 1: Create the three metaobject definitions

**Entities:** `compare_row`, `compare_competitor`, `compare` (create in this order — a reference field can only point at a type that already exists).

**Interfaces:**
- Produces: metaobject types `compare_row`, `compare_competitor`, `compare` with the exact field keys listed below (later tasks and the Liquid read these keys verbatim).

- [ ] **Step 1: Connect the browser.** Load the extension tools (one ToolSearch), `tabs_context_mcp`, resolve the browser if multiple are connected (AskUserQuestion per the skill), open a fresh tab.

- [ ] **Step 2: Create `compare_row`.** Navigate `https://admin.shopify.com/store/wearelarke/settings/custom_data/metaobjects` → Add definition. Name it "Compare row" (type handle `compare_row`). Add four fields, each **Single line text**, keys exactly: `label`, `larke_value`, `larke_badge`, `competitor_value`. Set the display-name to the `label` field. Save.

- [ ] **Step 3: Verify `compare_row`.** Screenshot the saved definition; confirm the four field keys and that the type handle is `compare_row` (shown in the URL / definition header).

- [ ] **Step 4: Create `compare_competitor`.** Add definition "Compare competitor" (handle `compare_competitor`). Fields:
  - `name` — Single line text (set as display name)
  - `logo` — **File** (`file_reference`)
  - `footnote` — Single line text
  - `rows` — **Metaobject** reference, **list**, referencing `compare_row`.
  Save.

- [ ] **Step 5: Verify `compare_competitor`.** Screenshot; confirm `rows` is a *list of* `compare_row` references and `logo` is a File field.

- [ ] **Step 6: Create `compare`.** Add definition "Compare" (handle `compare`). Fields:
  - `title` — Single line text (display name)
  - `competitors` — Metaobject reference, **list**, referencing `compare_competitor`.
  Save.

- [ ] **Step 7: Verify all three.** Screenshot the metaobjects list showing `compare`, `compare_competitor`, `compare_row`. This task is done when all three exist with the exact field keys above.

---

### Task 2: Create the product metafield definition `larke.compare`

**Interfaces:**
- Consumes: the `compare` metaobject type (Task 1).
- Produces: `product.metafields.larke.compare` (metaobject reference → `compare`), the accessor the Liquid uses.

- [ ] **Step 1: Open product metafield definitions.** Navigate `https://admin.shopify.com/store/wearelarke/settings/custom_data/product/metafields`; wait ~3s.

- [ ] **Step 2: Add definition.** Name "Compare". Set **Namespace and key** explicitly to `larke.compare` (click "Select type" flow; the key must be `larke.compare`, not an auto-generated one). Type = **Metaobject** → reference `compare`, single (not list). Save.

- [ ] **Step 3: Verify.** Screenshot; confirm the definition reads namespace `larke`, key `compare`, type "Metaobject reference (Compare)".

---

### Task 3: Upload the Simba logo to Shopify Files

The extension cannot drive an OS file picker and `file_upload` is broken, so use **Upload from URL** with a fresh public Figma export URL.

- [ ] **Step 1: Get a fresh public URL for the Simba logo.** Call `mcp__plugin_figma_figma__get_design_context` (or `download_assets`) on file `EFl58zcozCynPI3AhJU4Ct`, node `45075:8480` (the "svgexport-13 1" competitor-logo node). Copy the returned `imgSvgexport131` figma.com asset URL (public, ~7-day TTL — only needed once).

- [ ] **Step 2: Upload from URL.** Navigate `https://admin.shopify.com/store/wearelarke/content/files`; wait ~3s. Click **Upload files ▸ Upload from URL** (separate call; screenshot to confirm the modal opened). Paste the Figma URL; give it the filename `dev-compare-logo-simba.svg`. Confirm upload.

- [ ] **Step 3: Verify.** Screenshot Files filtered to `dev-compare-logo-simba`; confirm the SVG is present and renders (grey plaque + white SIMBA). This is the file the `compare_competitor.logo` field will point at in Task 4.

---

### Task 4: Create the Simba metaobject entries

Build bottom-up: rows → competitor → compare. Use the `shopify-admin-browser` Workflow A (find → form_input; picker in a separate call).

**Interfaces:**
- Consumes: types from Task 1, the Files SVG from Task 3.
- Produces: one `compare` entry whose `competitors` list contains one `compare_competitor` ("Simba") whose `rows` list contains four `compare_row` entries — populated with the canonical Simba data table.

- [ ] **Step 1: Create four `compare_row` entries.** For each of rows 1–4 in the canonical table: navigate `.../content/metaobjects/entries/compare_row/new`; wait ~2.5s; `find` the four text fields; `form_input` `label`, `larke_value`, `larke_badge`, `competitor_value`; wait ~2s; Save; verify "Entry added". (Row 3 `larke_badge` = `+3 years`; row 4 values use the `£` sign verbatim.)

- [ ] **Step 2: Create the `compare_competitor` "Simba" entry.** Navigate `.../entries/compare_competitor/new`; wait ~2.5s. `form_input` `name` = `Simba`, `footnote` = `As compared to the Simba hybrid, valid as of 2026*`. For `logo`: click the file picker in a **separate** call → confirm open → search `dev-compare-logo-simba` → wait ~2s → click the match → Done. For `rows`: open the list reference → check the four `compare_row` entries **in order Filling→Free Trial→Warranty→Price** → Done. Wait ~2s → Save → verify.

- [ ] **Step 3: Create the `compare` entry.** Navigate `.../entries/compare/new`; wait ~2.5s. `form_input` `title` = `How we compare`. For `competitors`: open the list reference → check the `Simba` entry → Done. Wait ~2s → Save → verify.

- [ ] **Step 4: Verify the graph.** Reload the `compare_competitor` list — "Simba" shows References ≥ 1 (linked from `compare`); reload `compare_row` — each shows References = 1. Screenshot.

---

### Task 5: Link the metafield on the product

**Interfaces:**
- Consumes: the `compare` entry (Task 4), the `larke.compare` definition (Task 2).
- Produces: `natural-duvet.metafields.larke.compare` resolving to the `compare` entry.

- [ ] **Step 1: Open the product.** Navigate `https://admin.shopify.com/store/wearelarke/products?query=natural-duvet` → click the row; wait ~3.5s.

- [ ] **Step 2: Set the metafield.** Separate call: scroll to "Metafields" (or "Product metafields"). Click the **Compare** metafield → in the reference picker, select the `How we compare` (`compare`) entry.

- [ ] **Step 3: Save safely.** Click outside the picker → scroll up → if a category "suggestion" banner appears, **do not Accept** (dismiss/ignore) → Save → verify "Product saved".

- [ ] **Step 4: Verify.** Reload the `compare` entry — References = 1 (from the product). Screenshot.

---

### Task 6: Rewire `dev-compare.liquid` to the metaobject (and delete the hardcode)

**Files:**
- Modify: `sections/dev-compare.liquid`

**Interfaces:**
- Consumes: `product.metafields.larke.compare.value` → `.title`, `.competitors.value[]` → `.name`, `.logo`, `.footnote`, `.rows.value[]` → `.label`, `.larke_value`, `.larke_badge`, `.competitor_value`.
- Produces: the same DOM contract `dev-compare.js` already binds to (`#compare-modal`, `.dev-compare__toggle-indicator`, `[data-compare-tab]`, `[data-compare-panel]`, `data-compare-close`, `.dev-compare__panel[tabindex="-1"]`).

- [ ] **Step 1: Replace the data + markup.** In `sections/dev-compare.liquid`, delete the hardcoded `{%- liquid … assign competitors = 'Simba,Roa,Piglet' … simba_values … -%}` block and the `{%- for competitor in competitors -%}` render, and move the asset tags + `<style>` inside a guard. The body becomes:

```liquid
{%- liquid
  assign compare = product.metafields.larke.compare.value
  assign competitors = compare.competitors.value
-%}
{%- if compare != blank and competitors.size > 0 -%}
{{ 'dev-compare.css' | asset_url | stylesheet_tag }}
<script src="{{ 'dev-compare.js' | asset_url }}" defer></script>

<style>
  .dev-compare { /* …unchanged token block… */ }
</style>

{%- capture icon_check -%}<svg class="dev-compare__icon dev-compare__icon--check" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>{%- endcapture -%}
{%- capture icon_x -%}<svg class="dev-compare__icon dev-compare__icon--x" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M10 14L12 12M12 12L14 10M12 12L10 10M12 12L14 14M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>{%- endcapture -%}

<div id="compare-modal" class="dev-compare" role="dialog" aria-modal="true" aria-labelledby="compare-modal-title" data-open="false" aria-hidden="true" inert
  style="--bg: {{ section.settings.background_color }}; --color: {{ section.settings.text_color }}; --backdrop: {{ section.settings.backdrop_color }}; --backdrop-opacity: {{ section.settings.backdrop_opacity | divided_by: 100.0 }};">
  <div class="dev-compare__backdrop" data-compare-close></div>
  <div class="dev-compare__panel" tabindex="-1">
    <div class="dev-compare__header">
      <h2 class="dev-compare__title" id="compare-modal-title">{{ compare.title.value | default: 'How we compare' | escape }}</h2>
      <button type="button" class="dev-compare__close" aria-label="{{ 'actions.close' | t | escape }}" data-compare-close>
        <svg class="dev-compare__close-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M7 17L17 7M7 7L17 17" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
    </div>
    <div class="dev-compare__body">
      <div class="dev-compare__inner">
        <div class="dev-compare__toggle" role="tablist" aria-label="Compare Larke against">
          <span class="dev-compare__toggle-indicator" aria-hidden="true"></span>
          {%- for competitor in competitors -%}
            {%- assign key = competitor.name.value | handleize -%}
            <button type="button" class="dev-compare__toggle-btn" role="tab" id="compare-tab-{{ key }}" data-compare-tab="{{ key }}" aria-controls="compare-panel-{{ key }}" aria-selected="{% if forloop.first %}true{% else %}false{% endif %}" tabindex="{% if forloop.first %}0{% else %}-1{% endif %}">{{ competitor.name.value | escape }}</button>
          {%- endfor -%}
        </div>

        {%- for competitor in competitors -%}
          {%- assign key = competitor.name.value | handleize -%}
          <div class="dev-compare__panel-content" role="tabpanel" id="compare-panel-{{ key }}" data-compare-panel="{{ key }}" aria-labelledby="compare-tab-{{ key }}" {% unless forloop.first %}hidden{% endunless %}>
            <div class="dev-compare__logos">
              <span class="dev-compare__logo dev-compare__logo--larke">
                <img src="{{ 'dev-compare-logo-larke.svg' | asset_url }}" width="110" height="33" alt="Larke" loading="lazy">
              </span>
              <span class="dev-compare__logo dev-compare__logo--comp">
                {%- assign comp_logo = competitor.logo.value -%}
                {%- if comp_logo != blank -%}
                  <img src="{{ comp_logo.url | default: comp_logo }}" width="110" height="33" alt="{{ competitor.name.value | escape }}" loading="lazy">
                {%- endif -%}
              </span>
            </div>
            <div class="dev-compare__rows">
              {%- for row in competitor.rows.value -%}
                <div class="dev-compare__row">
                  <p class="dev-compare__row-label">{{ row.label.value | escape }}</p>
                  <div class="dev-compare__cells">
                    <div class="dev-compare__cell dev-compare__cell--larke">
                      <div class="dev-compare__cell-main">
                        {{ icon_check }}
                        <p class="dev-compare__value">{{ row.larke_value.value | escape }}</p>
                      </div>
                      {%- if row.larke_badge.value != blank -%}
                        <span class="dev-compare__badge">{{ row.larke_badge.value | escape }}</span>
                      {%- endif -%}
                    </div>
                    <div class="dev-compare__cell dev-compare__cell--comp">
                      <div class="dev-compare__cell-main">
                        {{ icon_x }}
                        <p class="dev-compare__value dev-compare__value--comp">{{ row.competitor_value.value | escape }}</p>
                      </div>
                    </div>
                  </div>
                </div>
              {%- endfor -%}
            </div>
            {%- if competitor.footnote.value != blank -%}
              <p class="dev-compare__footnote">{{ competitor.footnote.value | escape }}</p>
            {%- endif -%}
          </div>
        {%- endfor -%}
      </div>
    </div>
  </div>
</div>
{%- endif -%}
```

  The `{% schema %}` block stays **outside** the guard, unchanged (it is read statically). Keep the existing `<style>` token block verbatim inside the guard. `comp_logo.url` covers the SVG (GenericFile) case; `| default: comp_logo` degrades gracefully if a raster MediaImage is ever used.

- [ ] **Step 2: Lint.** Run `shopify theme check sections/dev-compare.liquid`. Expected: no new offenses (the pre-existing `UniqueStaticBlockId` errors live in other files).

- [ ] **Step 3: Verify server render from the metaobject.** Run:
```bash
curl -s --max-time 25 "http://localhost:9292/products/natural-duvet" > /tmp/pdp.html
grep -c 'id="compare-modal"' /tmp/pdp.html                     # 1
grep -oE 'data-compare-tab="[a-z]+"' /tmp/pdp.html | sort -u    # simba (only)
for s in "100% tree-fibre" "£120" "£20 cheaper" "Twice the trial" "Recycled PET plastic bottles" "As compared to the Simba"; do grep -qF "$s" /tmp/pdp.html && echo "OK: $s" || echo "MISS: $s"; done
grep -oE 'dev-compare-logo-simba|cdn.shopify.com/[^"]*simba[^"]*' /tmp/pdp.html | head   # Files URL, not the theme asset
```
  Expected: modal present, one `simba` tab, all Simba strings OK, competitor logo now served from `cdn.shopify.com` (Files), not `assets/`.

- [ ] **Step 4: Browser sanity.** Open the modal from the "Still undecided?" trigger; confirm it slides in from the right with the Simba data and the toggle shows a single tab. (Extension may not reach the dev PDP — if so, the user confirms in their own browser.)

- [ ] **Step 5: Commit.**
```bash
git add sections/dev-compare.liquid
git commit -m "$(cat <<'EOF'
refactor(compare): read the popup from the larke.compare metaobject

Replaces the hardcoded Simba/Roa/Piglet arrays with a loop over
product.metafields.larke.compare — title, competitors, per-competitor
logo/footnote and rows (label / larke_value / larke_badge /
competitor_value). Tabs and panels are now data-driven, so a competitor
appears only once its entry exists. CSS/JS unchanged. Guarded like the
size/season guides; assets load only when the metaobject is present.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Regression check — no data, other pages

**Interfaces:**
- Consumes: the guard added in Task 6.

- [ ] **Step 1: A product without the metafield renders nothing.** If another product exists without `larke.compare` set, `curl` its PDP and confirm `id="compare-modal"` is absent and `dev-compare.css` is **not** requested (guard wraps the assets). If `natural-duvet` is the only product, note this is covered by the guard and skip.

- [ ] **Step 2: Non-product pages are unaffected.** `curl` the homepage; confirm no `compare-modal` and no `dev-compare.css` (the section is only on the product template). No commit — this task is verification only.

---

### Task 8 (follow-up, non-blocking): Add Roa and Piglet

Requires the user to supply each competitor's logo + the four `competitor_value`s, the four Larke `larke_badge`s for that matchup, and the footnote. **Zero code** — repeat Task 3 (upload logo) and Task 4 Steps 1–2 (four `compare_row`s + one `compare_competitor`), then edit the `compare` entry's `competitors` list to append the new competitor. The tab and panel appear automatically on the next render.

- [ ] **Step 1:** Collect Roa data + logo; upload logo (Task 3 pattern).
- [ ] **Step 2:** Create Roa's four `compare_row`s + `compare_competitor` (Task 4 pattern); append to `compare.competitors`.
- [ ] **Step 3:** Repeat for Piglet.
- [ ] **Step 4:** `curl` the PDP; confirm three `data-compare-tab` values and each competitor's data. Screenshot the toggle switching in-browser.

---

## Notes for the implementer

- Metaobject **field keys are a contract** with the Liquid in Task 6 — create them exactly: `label`, `larke_value`, `larke_badge`, `competitor_value`, `name`, `logo`, `footnote`, `rows`, `title`, `competitors`. A typo here surfaces as a blank cell, not an error.
- Reference fields must be created **child-first** (Task 1 order) — Shopify won't offer a type as a reference target until it exists.
- The `£` character must be entered literally in the row values; it round-trips through `form_input` and `escape` fine.
- Do not delete `assets/dev-compare-logo-simba.svg` from the repo — it is the source of truth for the Files upload and costs nothing to keep.
