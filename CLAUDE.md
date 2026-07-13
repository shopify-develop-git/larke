# CLAUDE.md

Guidance for Claude Code working in this repository.

## Project

**Larke** — UK duvet / bedding brand. Shopify theme **Horizon 4.1.1**, store handle `wearelarke`.
The site is being implemented from a Figma design, section by section, to a pixel-verified standard.

## Hard rules — these override anything else

- **Never run `shopify theme push`.** Never modify any remote theme. `larke/main` exists for the user only.
  All work happens against the local dev server: `shopify theme dev --store wearelarke`.
- **No API keys, no tokens, no `.env`.** Anything that touches the store goes through the
  **Chrome extension** in the already-logged-in browser. There is no Shopify Admin API token
  and there never will be. If a task seems to need one, the task is wrong — stop and ask.
- **Custom sections only.** Build `dev-`-prefixed sections; do not use or edit Horizon's stock sections.
- **Never overwrite an existing `dev-*` file.** On a name collision, stop and ask for a different name.
- **Never tune the QA threshold to make a section pass.** A failing section is information, not an obstacle.

## Architecture

Standard Horizon layout. `layout/`, `templates/` (JSON), `sections/`, `blocks/`, `snippets/`,
`assets/` (no build step — CSS and JS are served directly), `config/`, `locales/`.

### Custom sections

Three files per section, no more:

```
sections/dev-{name}.liquid    ← structure + {% schema %}
assets/dev-{name}.css         ← styles
assets/dev-{name}.js          ← only if the section is interactive
```

Rules for writing them: **`.claude/references/code-standards.md`**. Read it before writing a
section — it is the spec, not a suggestion.

Brand values (fonts, container width, base padding, type tokens) are **not** in the standards file.
They come from Figma, via the Design Brief. Never hardcode a font family or a container width.

## The workflow

Figma → section conversion runs as a multi-agent workflow: `.claude/workflows/figma-shopify.js`.
Up to 3 sections build in parallel, each with a PM, 2 devs, and 2 QA agents. QA verifies with a
pixel diff (against the Figma artboard) and computed-style assertions (via DevTools MCP).

- Project config, Figma node map, and quirks: **`.claude/figma-shopify.json`** — read this first.
- Design spec: `docs/superpowers/specs/2026-07-13-figma-shopify-workflow-design.md`
- What has actually been built: **`docs/IMPLEMENTATION.md`**

## Commands

```bash
shopify theme dev --store wearelarke   # local preview on :9292 — the only way we run the theme
shopify theme check                    # lint
cd .claude/tools && npm install        # one-time, for the pixel-diff tool
```

There is no build, bundler, or test runner. Validation is `shopify theme check` plus the QA agents.

## Conventions

- BEM: `.{name}__element--modifier`
- Section CSS vars on the root: `--bg`, `--color`, `--accent`, `--pt`, `--pb`
- Brand params as CSS vars: `--font-body`, `--font-heading`, `--container-max`, `--section-px`
- Breakpoints: 1024 (tablet), 768 (mobile), 480 (small mobile)
- Images: `image_url` + `image_tag`. **Never `img_url`.**
- `{{ block.shopify_attributes }}` on every block wrapper
- `<h2>` for a section heading, `<h3>` for a block heading (`<h1>` belongs to the page title)
- Schema settings order: Content → Colors → Spacing → Layout
- Preset names are clean and human ("Featured product"), never prefixed "Dev"
- Translation keys use the `t:` prefix; `{%- -%}` dash tags for whitespace control
