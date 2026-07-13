# Figma → Shopify: Multi-Agent Workflow (Design Spec)

**Date:** 2026-07-13
**Project:** larke (Shopify Horizon 4.1.1)
**Status:** approved

---

## 1. Goal

Implement the Larke Figma design in the Shopify Horizon theme so the build **matches the design exactly** — on desktop, tablet, and mobile. The workflow must be **reusable on future projects**, not just larke.

The key requirement: pixel-perfect must be **measured**, not asserted. That is why verification uses two independent methods rather than an eyeball.

---

## 2. Context

The approach is already proven on four projects (`good-dog`, `prowl`, `weathervane`, `silly-goose-kids`):

- **custom sections** prefixed `dev-`, instead of Horizon's stock sections;
- three files per section: `sections/dev-{name}.liquid`, `assets/dev-{name}.css`, `assets/dev-{name}.js` (JS only when the section is interactive);
- BEM naming, section-level CSS variables (`--bg`, `--color`, `--accent`, `--pt`, `--pb`);
- breakpoints 1024 / 768 / 480;
- a `/convert` command (`get-figma-to-shopify.md`) plus a `figma-reader` subagent that produces a **Design Brief**.

**A cost we accept knowingly:** `get-figma-to-shopify.md` exists in four repositories as four copies that have already drifted apart. By the owner's decision the workflow lives **inside the project** (`larke/.claude/`), so the files must stay easy to lift into the next repo.

### 2.1 What happens to the old command

The `/convert` command is **deleted**. Its orchestration — URL parsing, "invoke figma-reader", the Plan step, the report format — is fully superseded by the new workflow and the PM.

But the file is two different things wearing one wrapper, and only one of them should be thrown away:

| Part | Fate |
|---|---|
| Command wrapper: Figma URL parsing, steps 1–3, final report format | ❌ dead, delete |
| Structural code rules: Liquid file order, BEM, `image_tag` not `img_url`, `block.shopify_attributes`, `<h2>`/`<h3>`, schema and settings order, the 6-block CSS structure, the column-collapse table, `calc()` for mobile type, 44px touch targets, the four JS patterns (accordion / slider / tabs / scroll-reveal), `aria-*` rules | ✅ moves to `.claude/references/code-standards.md` |

Without the second part, `dev-markup` and `dev-styles` would write Liquid "however it comes out", and `qa-metrics` would have no checklist to assert against. Pixel-perfect falls apart on exactly these details.

### 2.2 What does NOT move: another project's design system

The old spec has another brand's constants baked into it. Copying them into larke verbatim would cement good-dog's design system here, and we would spend a long time asking why the font is wrong.

| Hardcoded in the old spec | Where it must come from in larke |
|---|---|
| `font-family: var(--font-graphik)` | the font in Figma |
| `padding-left / right: 40px` | base padding in Figma |
| `max-width: 1440px` wrapper | container width in Figma |
| `var(--body-16-font-family)`, `var(--desktop-h2-font-size)` | typography tokens in Figma |

**Rule:** `code-standards.md` keeps **only structural rules**, universal to any Horizon project. Everything brand-dependent — fonts, base padding, container width, token names and values — is a **parameter** that `figma-reader` extracts into the Design Brief and the PM freezes in the markup contract.

---

## 3. Principles

1. **The section is the unit of work.** One section = one lane = one PM.
2. **Execution order is code, not an agent's intentions.** The loop, the fan-out, and the round cap are enforced by the script; an agent cannot "forget" to run QA.
3. **Two agents never edit the same file.** File ownership is split hard.
4. **Documentation is generated from shipped code**, never from a plan.
5. **Nothing is ever published to the live theme.** Local dev server only.

---

## 4. Architecture

### 4.1 Overall flow

```
INTAKE      → store URL · theme · Figma · project instructions
PREFLIGHT   → shopify CLI · theme dev :9292 · Figma MCP · DevTools MCP · Chrome extension
DECOMPOSE   → Figma page map → ordered list of sections

  per lane (≤ 3 concurrent):
    figma-reader   → Design Brief (tokens, blocks, interactivity, brand params)
    asset-prep     → export images from Figma → upload to Files → shopify:// URIs
    PM             → markup contract (BEM tree, block plan, settings plan)
    Dev-1 ∥ Dev-2  → dev-{n}.liquid  ∥  dev-{n}.css / .js
    harness        → templates/index.qa{lane}.json → :9292/?view=qa{lane}
    QA-1  ∥ QA-2   → pixel diff  ∥  computed-style assertions (DevTools MCP)
    PM-triage      → dedupe defects, route each to the owning dev
    ↳ loop ≤ 5 rounds until PASS
    ↳ if it still fails — PM assembles a NEW team (fresh devs + QA), another ≤ 5 rounds
    ↳ if that team also fails — escalate to the human
    SCRIBE         → docs/sections/dev-{n}.md + update docs/IMPLEMENTATION.md
    PM-ship        → theme check → done
```

### 4.2 Width and depth are two different numbers

They are easy to confuse, so they are stated explicitly.

**WIDTH — 3 lanes at once.** At most **3 sections** are built in parallel, and each has its **own full team** (PM + 2 devs + 2 QA). So at peak, **3 teams** are working simultaneously. Remaining sections queue for a free lane. The lane number (1/2/3) selects the QA harness, so lanes never collide.

**DEPTH — 5 rounds × 2 teams.** This is how hard **one** section is retried **sequentially** inside its own lane (see §6.4). It has nothing to do with parallelism.

```
concurrently (width = 3):
  lane 1: hero    ← team A
  lane 2: footer  ← team B    these three run in parallel
  lane 3: faq     ← team C

inside lane 1 (depth), if team A burns 5 rounds:
  hero ← team A  (5 rounds) ✗
  hero ← team A2 (5 rounds, fresh context, rewrites from scratch)
        ↑ sequential, not parallel
```

---

## 5. Agent roles

All definitions live in `larke/.claude/agents/`.

| Agent | What it does | Reads | Writes |
|---|---|---|---|
| `figma-reader` | Reads a Figma node, returns the **Design Brief**: structure, Auto Layout, tokens, blocks, interactivity, brand params | Figma MCP | Design Brief (into context) |
| `asset-prep` | Exports images from Figma to a local folder, converts to WebP, uploads them to Shopify Files **via the Chrome extension**, returns `shopify://shop_images/...` | Figma MCP, Chrome extension | local files + URI list |
| `pm` | Names unnamed sections; writes the **markup contract** — the exact BEM tree, which elements become blocks, which become section settings. Later: triages defects and decides ship / fix / new team / escalate | Design Brief | `.claude/contracts/{section}.md` |
| `dev-markup` | Structure + schema | contract, Design Brief, `code-standards.md` | `sections/dev-{name}.liquid` |
| `dev-styles` | Styles + interactivity | contract, Design Brief, `code-standards.md` | `assets/dev-{name}.css`, `.js` |
| `qa-visual` | Pixel-diffs the rendered section against the Figma export, at each breakpoint that has an artboard | Chrome extension (screenshots) | report: diff % + annotated diff image |
| `qa-metrics` | Asserts computed styles and box metrics against the Design Brief token table | **DevTools MCP** | report: mismatches, with the exact property |
| `scribe` | Documents the code that **actually shipped** | shipped files + QA reports | `docs/sections/dev-{name}.md`, `docs/IMPLEMENTATION.md` |

### 5.0 The PM also names the sections

Some Figma frames are named meaninglessly: `Frame 4`, `Frame 6564`, four different `Image and text`. Neither a `dev-{name}` filename nor the section's purpose can be derived from those.

So the **PM assigns the name**: it looks at the section via `get_screenshot`, works out what it does, and gives it a descriptive kebab-case name based on its content. The chosen name is **written back** into `.claude/figma-shopify.json` so it stays stable between runs — otherwise a re-run would create a second `dev-*` file, under a different name, for the same section.

### 5.1 Why the PM writes a markup contract

Two devs must work in parallel on a section that has only three files. Without a shared agreement they either wait on each other, or write CSS against classes that don't exist.

So the PM freezes the BEM tree up front:

```
.hero                 <section>
.hero__inner
.hero__heading        <h2>
.hero__text           <p>
.hero__card           block × 3
.hero__card-image     <img>
```

After that `dev-markup` writes Liquid against those classes and `dev-styles` writes CSS against the same ones. No shared files, nothing to wait for.

### 5.2 Defect routing

Because file ownership is split, every defect has exactly one owner:

- wrong `font-size`, `gap`, `padding`, colour, breakpoint → **dev-styles**;
- missing block setting, wrong tag, missing `alt`, missing `block.shopify_attributes` → **dev-markup**.

The PM does not "ask someone to fix it" — it addresses the defect to the owner of the file.

---

## 6. Quality control

### 6.1 Two independent methods

**QA-1 (visual).** Export the Figma node to PNG per breakpoint; screenshot the rendered section at the same width; pixel diff.

**QA-2 (metrics, DevTools MCP).** Read the computed styles and box model of every element and assert them against the Design Brief token table.

The methods are deliberately different. A diff tells you **that** something is wrong but not **which property** is at fault. Metrics name the property but cannot see what the token table never described: overlap, clipped text, a broken background, wrong stacking order. Together they cover each other's blind spots.

### 6.2 Verification breakpoints

Figma has only two tabs — **Desktop (1440)** and **Mobile (375)**. So a reference artboard exists for exactly two widths. That determines where a diff is honest and where it is not.

| Viewport width | Artboard exists? | What QA does |
|---|---|---|
| 1440 px | ✅ Desktop (`28968:22885`) | **pixel diff** + metrics |
| 1024 px | ❌ none | metrics + sanity checks only |
| 768 px | ❌ none | metrics + sanity checks only |
| 375 px | ✅ Mobile (`28899:21894`) | **pixel diff** + metrics |

**Sanity checks** at 1024/768 (where there is no reference): no horizontal scroll; nothing overlaps; no clipped text; images are not stretched; touch targets ≥ 44px.

**Rule:** `qa-visual` **may not** diff at a width that has no artboard. Inventing a reference is worse than not checking — it manufactures a false "green".

### 6.3 Pass threshold

A section **fails** if the diff exceeds **0.5%** of pixels at any breakpoint that has a reference (with anti-aliasing tolerance).

The threshold is deliberately not zero: Figma and the browser rasterize type differently, so 0% is unreachable and chasing it is a waste. 0.5% is tight enough to catch a 2px spacing error.

### 6.4 The fix loop and team replacement

When QA finds a defect it goes back to the devs. Round and round.

**Level 1 — fix rounds (up to 5).** The PM triages defects, routes them to the file owners, devs fix, QA re-checks. Maximum **5 rounds** per team.

**Level 2 — a new team (up to 2 teams).** If the section still fails after five rounds, the PM **assembles a new team**: fresh `dev-markup`, `dev-styles`, `qa-visual`, `qa-metrics`. The new team receives:

- the Design Brief and the markup contract (unchanged — they are already verified);
- a **failure report** from the previous team: exactly what did not match and what was tried;
- permission to **rewrite the section from scratch** rather than patch someone else's code.

Why this works: an agent that has stared at its own broken CSS for five rounds is anchored on the same wrong model and keeps "fixing" the same thing. A fresh context re-reads the design without that assumption.

**Level 3 — the human.** If the second team also fails after its five rounds, stop and escalate. Two independent teams failing in the same place is no longer a code bug — it is a problem in the design, the Design Brief, or the contract. Tuning the threshold to turn it green is **forbidden**.

Ceiling: **2 teams × 5 rounds = 10 rounds** per section. An endless "almost fixed it" is impossible by construction.

---

## 7. How a section renders for QA at all

A new `dev-` section is on no page, and its `image_picker` settings are empty — out of the box it neither renders nor has images. Both problems are solved locally.

**Rendering.** Each lane writes its own alternate template, `templates/index.qa{lane}.json`, containing only its section with a preset. It is served at `http://127.0.0.1:9292/?view=qa{lane}`.

- no admin changes;
- three lanes never collide;
- the live theme is never touched.

These harness templates are temporary: they are gitignored and deleted when the lane finishes.

**Images — no API, no keys.** There is no Shopify Admin API token and there never will be.

**Why not WebP Exporter.** The project brief names the **WebP Exporter** plugin (Dev Mode, 3x, quality 90%). But that is a **Figma plugin**, and MCP cannot run plugins. `download_assets` returns png/jpg/svg/pdf up to 4x — WebP is not among them. So we reproduce the same result another way, fully automatically:

1. `asset-prep` pulls images via `download_assets` as **PNG @3x**;
2. converts them locally to **WebP at quality 90** (`cwebp -q 90`, cwebp 1.6.0 is installed) into `.assets-export/{section}/`;
3. opens the admin in Chrome → **Content → Files** and uploads them (Upload button / drag-and-drop);
4. confirms the upload with a screenshot and records the **actual** filenames (Shopify renames on collision);
5. returns the URIs, which the harness template drops straight in:

```json
"image": "shopify://shop_images/hero-desktop.webp"
```

The section then renders exactly as it would in production, so the diff is honest. The same files later serve the live site.

**Why Files, not the picker inside a section.** The picker lives in the theme editor, and the theme editor edits the **remote** theme — whereas the entire workflow runs locally (`shopify theme dev` + `?view=qa{lane}`). On top of that, the theme editor does not render while its Chrome tab is in the background, so automating it is unreliable. Uploading to Files gives the same result (`shopify://shop_images/...`) while staying controllable and local.

**A limit worth knowing:** uploading to Files changes store data. It is the only action in the whole workflow that leaves the local theme. It runs only for new files, and the agent prints the list of what it is about to upload beforehand.

---

## 8. Documentation

Written by `scribe`, **after** QA passes, by reading the actual files and the QA reports — not the plan, and not its own memory.

```
docs/
  IMPLEMENTATION.md        ← status board for every section
  sections/
    dev-hero.md            ← schema, blocks, CSS vars, Figma node, QA: 0.2% ✓
    dev-faq.md             ← … interactive: accordion
  typography-system.md     ← updated when tokens change
  components.md
```

`docs/IMPLEMENTATION.md` is a table: section → status → Figma node → final diff % → date.

Re-running a section **updates** its page rather than creating a duplicate.

---

## 9. Project configuration

The workflow asks on first run and **persists the answers** so it never asks twice: `.claude/figma-shopify.json`.

It already holds the real values for larke:

- **store:** `wearelarke` — `https://admin.shopify.com/store/wearelarke`
- **theme:** `local-only`. The remote theme `larke/main` exists for the user; **never** touch it, never `shopify theme push`.
- **Figma:** file `EFl58zcozCynPI3AhJU4Ct`; Desktop canvas `28968:22885` (1440), Mobile canvas `28899:21894` (375).
- **Pages:** homepage (13 sections, desktop↔mobile paired 13:13), PDP, Our Story, Tree Fibre, Delivery, Contact, Shipping.
- **Components** (drawers/modals, not page sections): Basket, Menu drawer, Size Guide, Seasons/Tog Guide, Review Summary, Compare, Accordions.
- **Build order:** shared chrome first — `announcement-bar`, `site-header`, `promo-bar`, `site-footer` appear on **every** page and are built **once**, never re-implemented per page.

There are **no keys and no tokens** — no `.env` at all. Everything that touches the store goes through the Chrome extension in the already-logged-in browser.

### 9.1 Figma quirks that will bite

Recorded in the config, because they are easy to trip over:

- Mobile `Frame 3` (`44821:902`) is **not a section** — it is a wrapper around Frame 6564 + Video section + Footer.
- Mobile Homepage has **two** `Menu - Mobile` frames (`45015:873`, `45240:2518`). `45240:2518` is the header; the other looks like a stray duplicate. Confirm before building.
- `Promo Bar - mobile` is the layer name on the **desktop** page too — the name lies; it is not mobile-only.
- Desktop has **two different** frames both named `Shipping` (`45246:3849`, `45246:4413`).

---

## 10. Prerequisites

Preflight checks these **before** any lane starts, and stops with a clear instruction rather than dying mid-lane:

| Prerequisite | Status as of 2026-07-13 |
|---|---|
| Shopify CLI (3.93.2) | ✅ installed |
| `shopify theme dev` on :9292 | checked at start |
| Figma MCP | ✅ authenticated |
| Chrome extension | ✅ connected (needed by `asset-prep` and `qa-visual`) |
| DevTools MCP | ✅ connected (needed by `qa-metrics`) |
| Logged into the Shopify admin in Chrome | checked at start — without it `asset-prep` cannot upload |
| `cwebp` | ✅ 1.6.0 installed |
| Admin API token | **not needed** — deliberate decision, everything goes through Chrome |

**Separately:** the `chrome-yevhenii` skill currently disables DevTools MCP outright. `qa-metrics` needs it, so the rule must be scoped rather than deleted: the Chrome extension drives the browser and takes screenshots, DevTools MCP measures. The skill will be amended so the two rules stop contradicting each other.

---

## 11. File layout

```
larke/
  .claude/
    figma-shopify.json          ← project config (already filled with real data)
    workflows/
      figma-shopify.js          ← orchestration: lanes, parallelism, QA loop
    agents/
      figma-reader.md  asset-prep.md  pm.md
      dev-markup.md    dev-styles.md
      qa-visual.md     qa-metrics.md  scribe.md
    references/
      code-standards.md         ← structural Liquid/CSS/JS rules (no brand constants)
    contracts/                  ← PM's markup contracts (runtime artifacts)
    tools/
      pixel-diff.mjs            ← pixel diff
  .assets-export/               ← Figma exports staged before upload (gitignored)
  docs/
    IMPLEMENTATION.md
    sections/
  CLAUDE.md                     ← project conventions
```

---

## 12. Success criteria

1. Every shipped section is within 0.5% diff at both reference widths (1440 and 375).
2. Three sections genuinely build in parallel, with no file conflicts and no manual intervention.
3. No section "passes" without both QA reports.
4. `docs/IMPLEMENTATION.md` matches what is actually in the theme, with no hand-editing.
5. The workflow moves to the next Horizon project by swapping `figma-shopify.json` — with no edits to the agents.
6. The live theme is never modified, not once.

---

## 13. Open items

1. **Section names:** seven homepage sections carry no semantic Figma name. The PM names them from content via `get_screenshot` and writes the names back into the config (§5.0).
2. **Duplicate mobile menu:** confirm which of `45015:873` / `45240:2518` is the real header before building `site-header`.
3. **Remaining pages:** only the homepage has been decomposed into sections so far. PDP, Our Story, Tree Fibre, Delivery, Contact, and Shipping still need their section lists extracted — this is mechanical and happens when their lanes start.
