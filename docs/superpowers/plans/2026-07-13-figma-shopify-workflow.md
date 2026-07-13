# Figma → Shopify Workflow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a reusable, PM-led multi-agent workflow that converts Figma designs into pixel-verified custom Shopify sections in the Horizon theme.

**Architecture:** A deterministic workflow script owns control flow. **Width:** up to 3 section lanes run concurrently, each with its own full team (PM + 2 devs + 2 QA) — so at peak, 3 teams work in parallel on 3 different sections. **Depth:** inside a lane, PM → (dev-markup ∥ dev-styles) → (qa-visual ∥ qa-metrics) → PM-triage loops up to 5 fix rounds; if the team still fails, the PM assembles one fresh replacement team that may rewrite from scratch and gets its own 5 rounds; only then does it escalate to the human. Scribe documents what actually shipped. Agents make judgment calls; the script guarantees the loop can't be skipped. Everything runs against a local `shopify theme dev` server; the live theme is never touched.

**Tech Stack:** Shopify Horizon 4.1.1 (Liquid + vanilla JS + CSS, no build step), Shopify CLI 3.93.2, Node 20, Claude Code Workflow tool, Figma MCP (reads), Chrome extension (screenshots + Files upload), Chrome DevTools MCP (computed-style measurement), `pixelmatch` + `pngjs` (pixel diff).

## Global Constraints

- **No API keys, no tokens, no `.env`.** Everything touching the store goes through the Chrome extension in the already-logged-in browser. There is no Shopify Admin API token and there never will be.
- **Never run `shopify theme push`.** The live theme is never modified. Local `shopify theme dev` only.
- **Custom sections only**, prefixed `dev-`: `sections/dev-{name}.liquid`, `assets/dev-{name}.css`, `assets/dev-{name}.js` (JS only when interactive).
- **No two agents ever write the same file.** `dev-markup` owns `.liquid`; `dev-styles` owns `.css`/`.js`.
- **Brand constants come from Figma, never from `code-standards.md`.** Fonts, base padding, container width, and typography token values are parameters in the Design Brief — not hardcoded rules.
- **QA threshold:** a section fails if pixel diff > **0.5%** at any of 1440 / 1024 / 768 / 375 px.
- **WIDTH — `CONCURRENT_LANES = 3`.** Up to 3 sections are built at the same time, each by its own full team. At peak, 3 teams run in parallel.
- **DEPTH — `MAX_ROUNDS = 5`, `MAX_TEAM_ATTEMPTS = 2`.** These describe retrying **one** section sequentially inside a single lane, and have nothing to do with parallelism. A team gets 5 fix rounds; if it still fails, the PM assembles one fresh replacement team (new dev + QA contexts) that may rewrite the section from scratch and gets its own 5 rounds. Ceiling: 10 rounds per section, then the human.
- **Never tune the threshold to make a section pass.** Two independent teams failing at the same place is a design/brief problem, not a code problem.
- **Never overwrite an existing `dev-*` file.** On name collision, stop and ask.
- Docs are generated from shipped files, never from plans.

---

## File Structure

| Path | Responsibility |
|---|---|
| `.claude/figma-shopify.json` | Per-project config: store, theme, Figma file, section list, instructions |
| `.claude/references/code-standards.md` | Structural Liquid/CSS/JS rules — brand-free, read by both dev agents and qa-metrics |
| `.claude/agents/figma-reader.md` | Figma node → Design Brief (incl. brand params) |
| `.claude/agents/asset-prep.md` | Figma export → local folder → Shopify Files via Chrome → `shopify://` URIs |
| `.claude/agents/pm.md` | Markup contract; defect triage; ship/escalate |
| `.claude/agents/dev-markup.md` | Writes `sections/dev-{name}.liquid` |
| `.claude/agents/dev-styles.md` | Writes `assets/dev-{name}.css` / `.js` |
| `.claude/agents/qa-visual.md` | Screenshots at 4 widths, pixel diff vs Figma export |
| `.claude/agents/qa-metrics.md` | DevTools MCP computed-style / box-metric assertions |
| `.claude/agents/scribe.md` | Reads shipped files + QA reports → docs |
| `.claude/workflows/figma-shopify.js` | Orchestration: lanes, parallelism, QA loop |
| `.claude/tools/pixel-diff.mjs` | Pixel diff CLI, exits non-zero over threshold |
| `.claude/tools/package.json` | `pixelmatch`, `pngjs` — isolated from theme root |
| `.claude/contracts/{section}.md` | PM's markup contract (runtime artifact) |
| `.assets-export/{section}/` | Figma exports staged for upload (gitignored) |
| `docs/IMPLEMENTATION.md` | Status board across all sections |
| `docs/sections/dev-{name}.md` | Per-section documentation |
| `CLAUDE.md` | Project conventions for any Claude session in this repo |

---

## Task 1: Repo scaffolding and config

**Files:**
- Create: `.gitignore`
- Create: `.shopifyignore`
- Create: `.claude/figma-shopify.json`
- Create: `CLAUDE.md`

**Interfaces:**
- Produces: `.claude/figma-shopify.json` — the config every later task reads. Keys: `store`, `theme`, `figma_file`, `sections[]` (each `{name, figma_node, page}`), `instructions`, `qa` (`{threshold_pct, breakpoints[]}`).

- [ ] **Step 1: Write `.gitignore`**

```gitignore
.DS_Store
node_modules/
.assets-export/
.claude/contracts/
templates/index.qa*.json
.qa-artifacts/
```

Rationale: QA harness templates and Figma exports are per-run artifacts. They must never be committed or pushed to the store.

- [ ] **Step 2: Write `.shopifyignore`**

```
.claude/
docs/
.assets-export/
.qa-artifacts/
node_modules/
```

Rationale: keeps agent tooling out of anything the Shopify CLI would sync.

- [ ] **Step 3: Write `.claude/figma-shopify.json`**

```json
{
  "store": "",
  "theme": "",
  "figma_file": "",
  "instructions": "",
  "sections": [],
  "qa": {
    "threshold_pct": 0.5,
    "breakpoints": [1440, 1024, 768, 375]
  }
}
```

Empty strings are intentional — the workflow's intake step fills them on first run and never asks again.

- [ ] **Step 4: Write `CLAUDE.md`**

Content must state: Horizon 4.1.1; custom `dev-` sections only; never `shopify theme push`; no API tokens (Chrome extension only); point to `.claude/references/code-standards.md` for code rules and `docs/IMPLEMENTATION.md` for what exists.

- [ ] **Step 5: Verify nothing tracked that shouldn't be**

Run: `git status --short && git check-ignore -v .assets-export templates/index.qa1.json`
Expected: both paths reported as ignored; no untracked artifact noise.

- [ ] **Step 6: Commit**

```bash
git add .gitignore .shopifyignore .claude/figma-shopify.json CLAUDE.md
git commit -m "chore: scaffold figma-shopify workflow config"
```

---

## Task 2: Code standards reference (brand-free)

**Files:**
- Create: `.claude/references/code-standards.md`

**Interfaces:**
- Consumes: the structural rules from the legacy `get-figma-to-shopify.md` (source of truth: `/Users/mynenkoyevhenii/Documents/EVDEV/Github/weathervane/.claude/commands/get-figma-to-shopify.md`).
- Produces: `code-standards.md`, read verbatim by `dev-markup`, `dev-styles`, and `qa-metrics`.

- [ ] **Step 1: Extract the structural rules**

Port these sections from the legacy file, unchanged in substance:
- Liquid file order: CSS tag first, JS tag only if interactive, `<style>` token block, root wrapper carrying `--bg/--color/--accent/--pt/--pb`.
- HTML: semantic tags, BEM `.{name}__el--mod`, `{%- -%}` dash tags, `<h2>` section / `<h3>` block, `{%- if x != blank -%}` guards.
- Images: `image_url` + `image_tag`, never `img_url`; mandatory `alt`; `widths` + `sizes`.
- Blocks: `{{ block.shopify_attributes }}` on every block wrapper.
- Accessibility: alt text, `aria-label` on icon buttons, `aria-expanded`/`aria-controls`, `<nav aria-label>`.
- Schema: template, hard rules, setting-type reference, order **Content → Colors → Spacing → Layout**, `limit` on blocks, ids lowercase+underscore, presets never prefixed "Dev".
- CSS: mandatory 6-block file structure (BASE / TABLET 1024 / MOBILE 768 / SMALL 480 / ACCESSIBILITY / REDUCED MOTION), flex vs grid, column-collapse table, `calc()` for mobile type, 44px touch targets, no hardcoded colors, no fixed heights, no horizontal scroll at 480.
- JS: per-section init pattern, no libraries, event delegation, and the four patterns — accordion, slider, tabs, scroll reveal — plus `aria-*` rules.

- [ ] **Step 2: Strip every brand constant**

These must NOT appear. Replace each with a Design-Brief parameter reference:

| Remove (good-dog's design system) | Replace with |
|---|---|
| `font-family: var(--font-graphik)` | `font-family: var(--font-body)` — value set from Design Brief |
| `padding-left/right: 40px` | `var(--section-px)` — from Design Brief |
| `max-width: 1440px` wrapper | `var(--container-max)` — from Design Brief |
| `var(--body-16-font-family)`, `var(--desktop-h2-font-size)` | tokens named in the Design Brief token table |

- [ ] **Step 3: Add the brand-params contract**

Document the exact CSS custom properties every section must consume, sourced from the Design Brief, so devs and QA agree on names:

```
--font-body, --font-heading      font families
--container-max                  container width
--section-px                     horizontal padding
--bg, --color, --accent          colors (merchant-editable)
--pt, --pb                       vertical padding (merchant-editable)
```

- [ ] **Step 4: Verify no brand leakage**

Run: `grep -niE 'graphik|1440px|40px|body-16|desktop-h2' .claude/references/code-standards.md`
Expected: **no matches.** Any hit is a brand constant that must be parameterized.

- [ ] **Step 5: Commit**

```bash
git add .claude/references/code-standards.md
git commit -m "docs: add brand-free code standards, retire /convert command"
```

---

## Task 3: Pixel-diff tool

**Files:**
- Create: `.claude/tools/package.json`
- Create: `.claude/tools/pixel-diff.mjs`
- Test: `.claude/tools/pixel-diff.test.mjs`

**Interfaces:**
- Produces: CLI `node .claude/tools/pixel-diff.mjs --a <figma.png> --b <render.png> --out <diff.png> --threshold 0.5`
  - stdout: JSON `{"diffPct": number, "diffPixels": number, "total": number, "pass": boolean}`
  - exit code `0` = pass, `1` = over threshold, `2` = error (e.g. size mismatch).
  - `qa-visual` depends on this exact contract.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "larke-qa-tools",
  "private": true,
  "type": "module",
  "dependencies": { "pixelmatch": "^6.0.0", "pngjs": "^7.0.0" }
}
```

- [ ] **Step 2: Install**

Run: `cd .claude/tools && npm install`
Expected: `node_modules/` created; no errors.

- [ ] **Step 3: Write the failing test**

```js
// .claude/tools/pixel-diff.test.mjs
import { strict as assert } from 'node:assert';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { writeFileSync } from 'node:fs';

function makePng(path, w, h, rgba) {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = rgba[0]; png.data[i+1] = rgba[1];
    png.data[i+2] = rgba[2]; png.data[i+3] = rgba[3];
  }
  writeFileSync(path, PNG.sync.write(png));
}

// identical images → 0% diff, pass
makePng('/tmp/a.png', 10, 10, [255,0,0,255]);
makePng('/tmp/b.png', 10, 10, [255,0,0,255]);
let out = execFileSync('node', ['pixel-diff.mjs','--a','/tmp/a.png','--b','/tmp/b.png','--out','/tmp/d.png','--threshold','0.5']);
let r = JSON.parse(out.toString());
assert.equal(r.diffPct, 0);
assert.equal(r.pass, true);

// fully different → 100% diff, fail, exit 1
makePng('/tmp/c.png', 10, 10, [0,255,0,255]);
try {
  execFileSync('node', ['pixel-diff.mjs','--a','/tmp/a.png','--b','/tmp/c.png','--out','/tmp/d.png','--threshold','0.5']);
  assert.fail('should have exited 1');
} catch (e) {
  assert.equal(e.status, 1);
  assert.equal(JSON.parse(e.stdout.toString()).pass, false);
}

console.log('pixel-diff tests passed');
```

- [ ] **Step 4: Run it — expect failure**

Run: `cd .claude/tools && node pixel-diff.test.mjs`
Expected: FAIL — `Cannot find module .../pixel-diff.mjs`

- [ ] **Step 5: Implement `pixel-diff.mjs`**

```js
#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith('--')) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, [])
);

try {
  const a = PNG.sync.read(readFileSync(args.a));
  const b = PNG.sync.read(readFileSync(args.b));

  if (a.width !== b.width || a.height !== b.height) {
    console.log(JSON.stringify({
      error: `size mismatch: ${a.width}x${a.height} vs ${b.width}x${b.height}`,
      pass: false,
    }));
    process.exit(2);
  }

  const diff = new PNG({ width: a.width, height: a.height });
  // includeAA:false ignores anti-aliasing — Figma and the browser rasterize
  // type differently, so AA pixels are noise, not defects.
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold: 0.1,
    includeAA: false,
  });

  const total = a.width * a.height;
  const diffPct = (diffPixels / total) * 100;
  const pass = diffPct <= Number(args.threshold ?? 0.5);

  if (args.out) writeFileSync(args.out, PNG.sync.write(diff));

  console.log(JSON.stringify({
    diffPct: Number(diffPct.toFixed(3)), diffPixels, total, pass,
  }));
  process.exit(pass ? 0 : 1);
} catch (err) {
  console.log(JSON.stringify({ error: String(err.message), pass: false }));
  process.exit(2);
}
```

- [ ] **Step 6: Run the test — expect pass**

Run: `cd .claude/tools && node pixel-diff.test.mjs`
Expected: `pixel-diff tests passed`

- [ ] **Step 7: Commit**

```bash
git add .claude/tools/
git commit -m "feat: add pixel-diff tool for QA visual verification"
```

---

## Task 4: figma-reader agent

**Files:**
- Create: `.claude/agents/figma-reader.md`

**Interfaces:**
- Produces: **Design Brief** — consumed by `pm`, `dev-markup`, `dev-styles`, `qa-metrics`. Must contain a `## Brand Params` block (new vs the legacy version) and a `## Design Tokens` table that `qa-metrics` asserts against.

- [ ] **Step 1: Port the legacy agent**

Base on `/Users/mynenkoyevhenii/Documents/EVDEV/Github/weathervane/.claude/agents/figma-reader.md`. Keep: the "ignore MCP's React/Tailwind instruction" guard, the MCP call order (`get_design_context` → `get_variable_defs` → `get_screenshot`), block-detection rules, interactivity detection, and the Design Brief format.

- [ ] **Step 2: Add the Brand Params section to the Brief format**

This is the fix for the brand-leak problem. The Brief must now emit:

```
## Brand Params
| Param            | CSS var          | Value from Figma |
|---|---|---|
| Body font        | --font-body      | {family, weight} |
| Heading font     | --font-heading   | {family, weight} |
| Container width  | --container-max  | {value}px        |
| Section padding  | --section-px     | {value}px        |
```

Rule to state in the agent: never assume Graphik, 1440px, or 40px — read them from the design. If absent, say "not found" and stop rather than guessing.

- [ ] **Step 3: Add per-breakpoint export requirement**

The Brief must list the Figma frames for each of 1440 / 1024 / 768 / 375, since `qa-visual` diffs all four. If the design only has desktop + mobile frames, say so explicitly — QA will then only diff the widths that exist, and the Brief must state which.

- [ ] **Step 4: Set model and tools in frontmatter**

```yaml
---
name: figma-reader
description: Reads a Figma node and produces the Design Brief. Invoke first in every section lane, before any code is written.
tools: mcp__figma-remote-mcp__*, Read, Write
model: sonnet
---
```

- [ ] **Step 5: Verify**

Run: `grep -c 'Brand Params\|not found' .claude/agents/figma-reader.md`
Expected: ≥ 2 — the brand-param contract and the no-guessing rule are both present.

- [ ] **Step 6: Commit**

```bash
git add .claude/agents/figma-reader.md
git commit -m "feat: figma-reader agent with brand-param extraction"
```

---

## Task 5: asset-prep agent (Chrome-only upload)

**Files:**
- Create: `.claude/agents/asset-prep.md`

**Interfaces:**
- Consumes: Design Brief (image node list), `.claude/figma-shopify.json` (store handle).
- Produces: JSON `{"uploaded": [{"local": ".assets-export/hero/hero-desktop.webp", "uri": "shopify://shop_images/hero-desktop.webp"}]}` — consumed by the harness step of the workflow.

- [ ] **Step 1: Write the agent, export phase**

Rules to state:
- Export every image node from the Design Brief into `.assets-export/{section}/`.
- Filenames: `{section}-{role}-{breakpoint}.{ext}` (e.g. `hero-bg-desktop.webp`) — lowercase, hyphens, no spaces. Shopify slugifies names on upload, so a predictable name is what makes the `shopify://` URI predictable.
- Prefer WebP; fall back to PNG for transparency.

- [ ] **Step 2: Write the agent, upload phase — Chrome extension only**

State plainly: **there is no Admin API token; never attempt an API call.** The upload path is:

1. `tabs_context_mcp` → `tabs_create_mcp` (fresh tab).
2. Navigate to `https://admin.shopify.com/store/{store}/content/files`.
3. **Bring the tab to the foreground.** The Shopify admin does not render reliably in a background tab — if the page is blank after ~10s, stop and ask the human to focus the tab. Do not keep waiting.
4. Before uploading, print the list of files about to be uploaded and their target store. Uploading changes store data — this is the only step in the whole workflow that leaves the local theme.
5. Click Upload, then use `file_upload` with the absolute local paths.
6. Screenshot to confirm each file appears in the Files list; read back the **actual** final filename (Shopify may rename on collision, e.g. `hero-bg-desktop_1.webp`).
7. Emit the URI list from the **read-back names**, never from the intended names.

- [ ] **Step 3: Add the idempotency rule**

Before uploading, search the Files list for each filename. If it already exists, reuse its URI and skip the upload. Re-running a lane must not litter the store with `_1`, `_2` duplicates.

- [ ] **Step 4: Frontmatter**

```yaml
---
name: asset-prep
description: Exports images from Figma to a local folder and uploads them to Shopify Files through the Chrome extension. Never uses an API token.
tools: mcp__figma-remote-mcp__*, mcp__claude-in-chrome__*, Read, Write, Bash
model: sonnet
---
```

- [ ] **Step 5: Verify the no-API rule is unambiguous**

Run: `grep -iE 'admin api|access token|X-Shopify' .claude/agents/asset-prep.md`
Expected: matches appear **only** in prohibition sentences ("never…", "there is no…"). No instruction anywhere tells the agent to use one.

- [ ] **Step 6: Commit**

```bash
git add .claude/agents/asset-prep.md
git commit -m "feat: asset-prep agent, Chrome-only Files upload"
```

---

## Task 6: PM agent

**Files:**
- Create: `.claude/agents/pm.md`

**Interfaces:**
- Consumes: Design Brief.
- Produces (mode `contract`): `.claude/contracts/{section}.md` — the BEM tree both devs build against.
- Produces (mode `triage`): JSON `{"defects":[{"id","summary","owner":"dev-markup"|"dev-styles","evidence"}],"verdict":"PASS"|"FIX"|"NEW_TEAM"|"ESCALATE"}`.
- Produces (mode `handoff`): a failure report handed to the replacement team — what failed, what the previous team tried, what to rewrite.

- [ ] **Step 1: Define mode `contract`**

Output format, written to `.claude/contracts/{section}.md`:

```markdown
# Contract: {section}

## BEM tree
.{name}                 <section>   root, carries --bg/--color/--accent/--pt/--pb
.{name}__inner          <div>       container, max-width var(--container-max)
.{name}__heading        <h2>
.{name}__card           <article>   BLOCK ×{n}
.{name}__card-image     <img>

## Blocks
type: card | limit: {n} | settings: image, heading, text, button_label, button_link

## Section settings
heading, background_color, text_color, accent_color, padding_top, padding_bottom

## Brand params (from Design Brief)
--font-body: {...}   --font-heading: {...}
--container-max: {...}px   --section-px: {...}px

## Interactivity
none | accordion | slider | tabs | scroll-reveal
```

Rule: the contract is **binding**. `dev-markup` must emit exactly these classes and tags; `dev-styles` must style exactly these classes. Neither invents a class the other doesn't know about.

- [ ] **Step 2: Define mode `triage`**

Rules:
- Merge the QA-1 and QA-2 defect lists; deduplicate (both QAs will often flag the same wrong `gap` from different angles).
- Assign an owner by file: font-size / gap / padding / color / breakpoint / overflow → `dev-styles`. Missing setting, wrong tag, missing `alt`, missing `block.shopify_attributes`, wrong heading level → `dev-markup`.
- Verdict `PASS` only when QA-1 is under threshold at **every** breakpoint **and** QA-2 reports zero mismatches.
- Verdict `FIX` while rounds remain on the current team.
- Verdict `NEW_TEAM` when the team has burned all 5 rounds and this is still team 1.
- Verdict `ESCALATE` when team 2 has burned all 5 rounds, or immediately if a defect is not fixable in code (e.g. the Figma export is missing a breakpoint entirely).

- [ ] **Step 3: Define mode `handoff` (new team briefing)**

When the verdict is `NEW_TEAM`, the PM writes a briefing for the replacement team containing:
- the defects that survived all 5 rounds, with QA evidence;
- what the previous team tried on each, and why it didn't work;
- an explicit licence to **rewrite the section from scratch** rather than patch the previous team's code.

State the reason in the agent: after five rounds an agent is anchored on its own broken mental model and keeps "fixing" the same wrong thing. The replacement team's value is a clean read of the Brief — so it must not be told to preserve the old implementation.

The Design Brief and the markup contract are **not** regenerated — they're already verified, and changing them would move the goalposts rather than fix the code.

- [ ] **Step 4: State the honesty rule**

The PM reports what QA actually returned. It never marks a section PASS to end the loop, never softens a defect list, and never relaxes the 0.5% threshold. If it escalates, it says exactly which assertions still fail, across both teams.

- [ ] **Step 4: Frontmatter**

```yaml
---
name: pm
description: Writes the binding markup contract for a section, then triages QA defects and routes each to the owning dev. Decides ship, fix, or escalate.
tools: Read, Write, Grep
model: sonnet
---
```

- [ ] **Step 5: Commit**

```bash
git add .claude/agents/pm.md
git commit -m "feat: pm agent — markup contract and defect triage"
```

---

## Task 7: dev-markup and dev-styles agents

**Files:**
- Create: `.claude/agents/dev-markup.md`
- Create: `.claude/agents/dev-styles.md`

**Interfaces:**
- Both consume: contract + Design Brief + `.claude/references/code-standards.md`.
- `dev-markup` produces `sections/dev-{name}.liquid` **only**.
- `dev-styles` produces `assets/dev-{name}.css` and, if the contract says interactive, `assets/dev-{name}.js` **only**.

- [ ] **Step 1: Write `dev-markup.md`**

Must state:
- Read `code-standards.md` in full before writing. It is the spec, not a suggestion.
- Emit exactly the classes and tags in the contract — no extras, no renames.
- Ownership: you write `sections/dev-{name}.liquid` and nothing else. Never touch `.css` or `.js` — another agent owns them, and editing them will clobber their work.
- Refuse to overwrite an existing `dev-*` file; report the collision instead.
- Set brand params as CSS vars on the root from the Design Brief.

- [ ] **Step 2: Write `dev-styles.md`**

Must state:
- Read `code-standards.md` in full first.
- All six CSS blocks must be present (BASE / 1024 / 768 / 480 / ACCESSIBILITY / REDUCED MOTION), even if a block is empty.
- Style only contract classes. If a class you need isn't in the contract, that's a contract bug — report it, don't invent markup.
- Ownership: you write `assets/dev-{name}.css` (+ `.js`). Never touch the `.liquid`.
- Consume brand params via `var(--font-body)`, `var(--container-max)`, `var(--section-px)` — never hardcode a font family, container width, or base padding.

- [ ] **Step 3: Frontmatter for both**

```yaml
---
name: dev-markup   # (dev-styles for the other)
description: Writes the Liquid + schema for one custom section, against a binding PM contract.
tools: Read, Write, Grep
model: sonnet
---
```

- [ ] **Step 4: Verify file-ownership rules are explicit**

Run: `grep -c 'Never touch' .claude/agents/dev-markup.md .claude/agents/dev-styles.md`
Expected: ≥ 1 in each. Without this, parallel devs will clobber each other — that's the single highest-risk failure in the whole design.

- [ ] **Step 5: Commit**

```bash
git add .claude/agents/dev-markup.md .claude/agents/dev-styles.md
git commit -m "feat: dev-markup and dev-styles agents with strict file ownership"
```

---

## Task 8: QA agents

**Files:**
- Create: `.claude/agents/qa-visual.md`
- Create: `.claude/agents/qa-metrics.md`

**Interfaces:**
- Both consume: the lane preview URL `http://127.0.0.1:9292/?view=qa{lane}`, Design Brief, Figma exports.
- `qa-visual` produces: `{"breakpoints":[{"width":1440,"diffPct":0.2,"pass":true,"diffImage":"..."}],"pass":bool}`
- `qa-metrics` produces: `{"mismatches":[{"selector":".hero__heading","prop":"font-size","expected":"32px","actual":"28px"}],"pass":bool}`
- Both feed `pm` in `triage` mode.

- [ ] **Step 1: Write `qa-visual.md`**

Procedure:
1. For each breakpoint in `qa.breakpoints`: resize the window (`resize_window`), navigate to the lane URL, screenshot the section only.
2. Run `node .claude/tools/pixel-diff.mjs --a <figma-export> --b <screenshot> --out <diff> --threshold 0.5`.
3. Report the diff % per breakpoint and attach the diff image path for any failure.

Rules: use the **Chrome extension** for screenshots (not DevTools MCP). Never declare a pass without having actually run the diff tool — report the tool's JSON verbatim.

- [ ] **Step 2: Write `qa-metrics.md`**

Procedure:
1. Connect via **Chrome DevTools MCP** to the lane URL.
2. For every row in the Design Brief token table and every element in the contract, read the computed style (`evaluate_script` → `getComputedStyle`) and the box metrics.
3. Assert: font-family, font-size, font-weight, line-height, color, background-color, gap, padding, margin, width/max-width, border-radius.
4. Repeat at each breakpoint (`resize_page`).
5. Report each mismatch with selector, property, expected, actual.

Rules: this is the agent that is **allowed** to use `mcp__chrome-devtools__*` — it is the measuring instrument. Report actual values; never round a mismatch away.

- [ ] **Step 3: Frontmatter**

```yaml
---
name: qa-visual
description: Pixel-diffs the rendered section against the Figma export at every breakpoint.
tools: mcp__claude-in-chrome__*, Bash, Read
model: sonnet
---
```

```yaml
---
name: qa-metrics
description: Asserts computed styles and box metrics against the Design Brief token table using Chrome DevTools MCP.
tools: mcp__chrome-devtools__*, Read
model: sonnet
---
```

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/qa-visual.md .claude/agents/qa-metrics.md
git commit -m "feat: qa-visual (pixel diff) and qa-metrics (DevTools) agents"
```

---

## Task 9: scribe agent and docs skeleton

**Files:**
- Create: `.claude/agents/scribe.md`
- Create: `docs/IMPLEMENTATION.md`

**Interfaces:**
- Consumes: shipped `sections/dev-{name}.liquid`, `assets/dev-{name}.css`/`.js`, QA reports.
- Produces: `docs/sections/dev-{name}.md`, and an updated row in `docs/IMPLEMENTATION.md`.

- [ ] **Step 1: Write `docs/IMPLEMENTATION.md` skeleton**

```markdown
# Implementation status

| Section | Status | Figma node | Interactive | QA diff (max) | Updated |
|---|---|---|---|---|---|
```

- [ ] **Step 2: Write `scribe.md`**

Rules:
- **Read the shipped files.** Derive the schema table by parsing the `{% schema %}` block, the CSS vars by grepping the CSS, the block types from the Liquid. Never document from the contract or the plan — those describe intent, and intent drifts from what shipped.
- Per-section doc contains: purpose, Figma node, files, schema settings table, block types + limits, CSS custom properties, interactivity, final QA numbers per breakpoint, screenshot path.
- Update, never duplicate: if `docs/sections/dev-{name}.md` exists, rewrite it and update its `IMPLEMENTATION.md` row in place.

- [ ] **Step 3: Frontmatter**

```yaml
---
name: scribe
description: Documents a shipped section by reading its actual files and QA reports. Runs after QA passes.
tools: Read, Write, Edit, Grep, Bash
model: sonnet
---
```

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/scribe.md docs/IMPLEMENTATION.md
git commit -m "feat: scribe agent and implementation status board"
```

---

## Task 10: Orchestration workflow

**Files:**
- Create: `.claude/workflows/figma-shopify.js`

**Interfaces:**
- Consumes: `.claude/figma-shopify.json`; all 8 agents.
- Produces: shipped sections + docs; a final summary per section with diff % and verdict.

- [ ] **Step 1: Write the preflight phase**

Checks, all fail-fast with an actionable message:
- `shopify theme dev` reachable on `127.0.0.1:9292` (curl).
- Figma MCP authenticated (currently **not** — must instruct the human to authenticate).
- Chrome extension connected (`tabs_context_mcp`), and the human is logged into the Shopify admin.
- `.claude/tools/node_modules` present.

- [ ] **Step 2: Write the lane pipeline**

```js
export const meta = {
  name: 'figma-shopify',
  description: 'Figma → pixel-verified custom Shopify sections, PM-led parallel lanes',
  phases: [
    { title: 'Preflight' }, { title: 'Brief' }, { title: 'Assets' },
    { title: 'Contract' }, { title: 'Build' }, { title: 'QA' },
    { title: 'Triage' }, { title: 'Docs' },
  ],
}

const cfg = args.config            // parsed .claude/figma-shopify.json

// TWO DIFFERENT NUMBERS — do not confuse them.
// CONCURRENT_LANES is WIDTH: how many sections are built at the same time.
// Each lane has its own full team (PM + 2 devs + 2 QA), so at peak
// 3 teams are working in parallel on 3 different sections.
const CONCURRENT_LANES = 3

// MAX_ROUNDS / MAX_TEAM_ATTEMPTS are DEPTH: how hard we retry ONE section,
// sequentially, inside a single lane. Nothing here runs in parallel.
const MAX_ROUNDS = 5               // fix rounds per team, on one section
const MAX_TEAM_ATTEMPTS = 2        // team, then a fresh replacement team, then the human

// pipeline() gives us lane independence: section B can be in QA while
// section A is still building. A barrier here would waste wall-clock.
const results = await pipeline(
  cfg.sections.map((s, i) => ({ ...s, lane: (i % CONCURRENT_LANES) + 1 })),

  async (s) => {
    const brief = await agent(`Read Figma node ${s.figma_node} for section "${s.name}".`,
      { agentType: 'figma-reader', phase: 'Brief', label: `brief:${s.name}` })
    return { s, brief }
  },

  async ({ s, brief }) => {
    const assets = await agent(`Export and upload images for "${s.name}".\n\n${brief}`,
      { agentType: 'asset-prep', phase: 'Assets', label: `assets:${s.name}` })
    return { s, brief, assets }
  },

  async ({ s, brief, assets }) => {
    const contract = await agent(`Mode: contract. Section "${s.name}".\n\n${brief}`,
      { agentType: 'pm', phase: 'Contract', label: `pm:${s.name}` })
    return { s, brief, assets, contract }
  },

  async (ctx) => {
    let team = 0, verdict = null, handoff = '', totalRounds = 0

    // OUTER loop: teams. A fresh team gets fresh agent contexts — that is the
    // entire point. Five rounds in, an agent is anchored on its own broken
    // model and keeps "fixing" the same wrong thing.
    while (team < MAX_TEAM_ATTEMPTS) {
      team++
      let round = 0, defects = ''

      // INNER loop: fix rounds within this team.
      while (round < MAX_ROUNDS) {
        round++; totalRounds++
        const first = round === 1
        // Team 2 round 1 is a rewrite, not a patch: it gets the handoff and
        // is explicitly allowed to discard the previous team's code.
        const verb = first
          ? (team === 1 ? 'Build' : 'REWRITE FROM SCRATCH — discard the previous implementation')
          : 'Fix'

        await parallel([
          () => agent(`${verb} the Liquid for "${ctx.s.name}". Team ${team}, round ${round}.\n` +
                      `Contract:\n${ctx.contract}\nBrief:\n${ctx.brief}\n` +
                      `Defects:\n${defects}\nPrevious team's failure report:\n${handoff}`,
            { agentType: 'dev-markup', phase: 'Build', label: `markup:${ctx.s.name}:t${team}r${round}` }),
          () => agent(`${verb} the CSS/JS for "${ctx.s.name}". Team ${team}, round ${round}.\n` +
                      `Contract:\n${ctx.contract}\nBrief:\n${ctx.brief}\n` +
                      `Defects:\n${defects}\nPrevious team's failure report:\n${handoff}`,
            { agentType: 'dev-styles', phase: 'Build', label: `styles:${ctx.s.name}:t${team}r${round}` }),
        ])

        // harness: this lane's alternate template, so 3 lanes never collide
        writeHarness(ctx.s, ctx.assets, ctx.s.lane)

        const [vis, met] = await parallel([
          () => agent(`Pixel-diff "${ctx.s.name}" at ${cfg.qa.breakpoints.join(', ')} against Figma. ` +
                      `URL: http://127.0.0.1:9292/?view=qa${ctx.s.lane}`,
            { agentType: 'qa-visual', phase: 'QA', label: `qa-vis:${ctx.s.name}:t${team}r${round}` }),
          () => agent(`Assert computed styles for "${ctx.s.name}" against the Brief token table. ` +
                      `URL: http://127.0.0.1:9292/?view=qa${ctx.s.lane}\n\n${ctx.brief}`,
            { agentType: 'qa-metrics', phase: 'QA', label: `qa-met:${ctx.s.name}:t${team}r${round}` }),
        ])

        const triage = await agent(
          `Mode: triage. Team ${team}/${MAX_TEAM_ATTEMPTS}, round ${round}/${MAX_ROUNDS} for "${ctx.s.name}".\n` +
          `QA-visual:\n${JSON.stringify(vis)}\nQA-metrics:\n${JSON.stringify(met)}`,
          { agentType: 'pm', phase: 'Triage', label: `triage:${ctx.s.name}:t${team}r${round}` })

        verdict = triage
        if (/PASS/.test(triage)) break
        defects = triage
      }

      if (/PASS/.test(verdict)) break

      if (team < MAX_TEAM_ATTEMPTS) {
        log(`↻ ${ctx.s.name}: team ${team} failed after ${MAX_ROUNDS} rounds — assembling a new team.`)
        handoff = await agent(
          `Mode: handoff. Team ${team} exhausted ${MAX_ROUNDS} rounds on "${ctx.s.name}" without passing.\n` +
          `Write the failure report for the replacement team: what still fails, what was tried, ` +
          `and confirm they may rewrite from scratch.\nLast triage:\n${verdict}`,
          { agentType: 'pm', phase: 'Triage', label: `handoff:${ctx.s.name}:t${team}` })
      }
    }

    return { ...ctx, verdict, teams: team, rounds: totalRounds }
  },

  async (ctx) => {
    if (!/PASS/.test(ctx.verdict)) {
      log(`⚠ ${ctx.s.name}: ESCALATED after ${ctx.rounds} rounds — not documented as shipped.`)
      return { section: ctx.s.name, shipped: false, verdict: ctx.verdict }
    }
    await agent(`Document shipped section "${ctx.s.name}". Read the actual files.`,
      { agentType: 'scribe', phase: 'Docs', label: `docs:${ctx.s.name}` })
    return { section: ctx.s.name, shipped: true, rounds: ctx.rounds }
  },
)

return results
```

Note: `writeHarness` writes `templates/index.qa{lane}.json` containing only this section, with the preset settings and the `shopify://` image URIs from `asset-prep`. It is deleted when the lane finishes.

- [ ] **Step 3: Verify escalation is honest**

The workflow must never document or claim a section as shipped when the verdict isn't PASS. Confirm the `shipped: false` branch skips the scribe. This is the guard against the loop quietly "finishing" broken work.

- [ ] **Step 4: Commit**

```bash
git add .claude/workflows/figma-shopify.js
git commit -m "feat: orchestration — 3 parallel lanes, 3-round QA loop"
```

---

## Task 11: Amend the chrome-yevhenii skill

**Files:**
- Modify: `/Users/mynenkoyevhenii/.claude/skills/chrome-yevhenii/SKILL.md`

The skill currently sets `disallowed-tools: mcp__chrome-devtools` and forbids DevTools MCP outright. `qa-metrics` needs it. Leaving this contradiction in place means an agent will either disobey the skill or refuse to measure.

- [ ] **Step 1: Scope the rule rather than deleting it**

Change the hard rule from "never DevTools MCP" to: *Chrome extension drives the browser and takes screenshots; DevTools MCP is permitted only as a measuring instrument (computed styles, box metrics, console, network) inside QA.* Remove the `disallowed-tools` line.

- [ ] **Step 2: Record the foreground-tab gotcha**

`references/workflows.md` already documents that the Shopify theme editor won't mount in a background tab. Add the same caveat for the Files upload page, since `asset-prep` depends on it.

- [ ] **Step 3: Commit** (this file is outside the repo — no commit; just report the change.)

---

## Task 12: End-to-end dry run

- [ ] **Step 1: Authenticate Figma MCP** — human step. Without it, `figma-reader` cannot read anything.
- [ ] **Step 2: Fill `.claude/figma-shopify.json`** with the real store, theme, Figma file, and ONE section.
- [ ] **Step 3: Start the dev server**

Run: `shopify theme dev --store <store>`
Expected: serving on `http://127.0.0.1:9292`.

- [ ] **Step 4: Run the workflow on that one section.**
- [ ] **Step 5: Verify the outcome honestly.**

Expected artifacts: `sections/dev-{name}.liquid`, `assets/dev-{name}.css`, a QA report per breakpoint with a real diff %, `docs/sections/dev-{name}.md`, a row in `docs/IMPLEMENTATION.md`, no `templates/index.qa*.json` left behind, and **zero changes to the live theme**.

If the section escalated instead of passing, that is a valid outcome — report the failing assertions rather than tuning the threshold to make it green.

- [ ] **Step 6: Only then scale to the full section list.**

---

## Self-review notes

- **Spec coverage:** intake/config → T1; code standards + brand-strip → T2; pixel diff → T3; 8 agents → T4–T9; lanes/parallelism/QA loop → T10; DevTools conflict → T11; success criteria → T12.
- **Known gap:** Figma MCP auth (T12 S1) and Shopify admin login are human steps. Neither can be automated, and both are checked in preflight rather than discovered mid-lane.
- **Highest risk:** two devs clobbering one file. Mitigated by the binding contract (T6) plus explicit ownership rules (T7 S4).
