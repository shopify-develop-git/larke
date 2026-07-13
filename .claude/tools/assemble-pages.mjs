#!/usr/bin/env node
// assemble-pages — wire every built dev-* section into the real templates.
//
// SHARED CHROME LIVES IN SECTION GROUPS, NOT IN EACH TEMPLATE.
// First attempt put the header/footer/drawers into every page template. Two things went wrong:
//   1. Opening the Shopify theme editor rewrote templates/index.json and silently DROPPED them —
//      the editor expects chrome to live in header-group / footer-group, and strips it elsewhere.
//   2. Every new page would have had to re-list them, and any fix would need doing N times.
// So: header-group.json + footer-group.json carry the chrome, and every page — homepage, Delivery,
// Contact, Shipping, PDP, anything added later — gets it for free.
//
// QA-ONLY SETTINGS ARE STRIPPED. Drawers expose `open_on_load` purely so the QA harness can render
// them open for a pixel diff. The assembler used to copy harness settings verbatim, and the live
// homepage shipped with the menu drawer AND the basket hanging open over the hero.
//
// A section is included only if its .liquid exists. Missing ones are reported, never invented:
// a page that omits a section is honest; referencing a section file that isn't there fails the
// whole theme upload for every page at once.
//
//   node .claude/tools/assemble-pages.mjs        # write templates
//   node .claude/tools/assemble-pages.mjs --dry  # show what it would do

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'

const DRY = process.argv.includes('--dry')

const HEADER_GROUP = ['announcement-bar', 'site-header', 'promo-bar']
const FOOTER_GROUP = ['site-footer', 'menu-drawer', 'cart-drawer'] // drawers are overlays: hidden, position irrelevant

// Page-specific sections only. Chrome comes from the groups above.
const PAGES = {
  'index.json': [
    'hero', 'trust-badges', 'wash-dry-repeat-promo', 'as-seen-in', 'video-promo-banner',
    'featured-product', 'cool-sleepers-promo', 'brand-social-gallery', 'video-story-banner',
  ],
  'page.our-story.json': [
    'our-story-hero', 'our-story-origin', 'proudest-moments', 'values-we-cherish', 'journal-cards',
  ],
  'page.tree-fibre.json': [
    'tree-fibre-hero', 'tree-fibre-intro', 'tree-fibre-steps', 'fibre-benefits', 'fibre-cta',
  ],
  // Not built yet — the templates are created empty so the pages exist and pick up the chrome.
  // Drop the section names in here as they land.
  'page.delivery.json': ['delivery-faq'],
  'page.shipping.json': ['delivery-faq'],
  'page.contact.json': ['contact-form'],
}

const QA_ONLY_SETTINGS = ['open_on_load']

// A section's verified settings live in its QA harness — that is where the real shopify:// image
// URIs ended up. Reuse them; never re-derive.
const settingsFor = (name) => {
  for (const f of readdirSync('templates').filter((f) => /^index\.qa\d+\.json$/.test(f))) {
    let t
    try { t = JSON.parse(readFileSync(`templates/${f}`, 'utf8')) } catch { continue }
    const hit = Object.values(t.sections || {}).find((s) => s.type === `dev-${name}`)
    if (!hit) continue
    const settings = { ...(hit.settings || {}) }
    const stripped = QA_ONLY_SETTINGS.filter((k) => k in settings)
    for (const k of stripped) delete settings[k]
    return { settings, blocks: hit.blocks, block_order: hit.block_order, stripped }
  }
  return null
}

const build = (names) => {
  const sections = {}
  const order = []
  const included = []
  const missing = []
  const stripped = []
  for (const name of names) {
    if (!existsSync(`sections/dev-${name}.liquid`)) { missing.push(name); continue }
    const s = settingsFor(name)
    const id = `dev-${name}`
    sections[id] = { type: `dev-${name}`, settings: s?.settings || {} }
    if (s?.blocks) sections[id].blocks = s.blocks
    if (s?.block_order) sections[id].block_order = s.block_order
    if (s?.stripped?.length) stripped.push(`${name}: ${s.stripped.join(',')}`)
    order.push(id)
    included.push(name)
  }
  return { sections, order, included, missing, stripped }
}

const report = {}

// --- section groups (chrome on every page) --------------------------------
for (const [file, names, type, label] of [
  ['sections/header-group.json', HEADER_GROUP, 'header', 'Header'],
  ['sections/footer-group.json', FOOTER_GROUP, 'footer', 'Footer'],
]) {
  const b = build(names)
  const doc = { type, name: label, sections: b.sections, order: b.order }
  if (!DRY) writeFileSync(file, JSON.stringify(doc, null, 2) + '\n')
  report[file] = { included: b.included, missing: b.missing, stripped_qa_only: b.stripped }
}

// --- page templates -------------------------------------------------------
for (const [file, names] of Object.entries(PAGES)) {
  const b = build(names)
  if (!DRY) writeFileSync(`templates/${file}`, JSON.stringify({ sections: b.sections, order: b.order }, null, 2) + '\n')
  report[`templates/${file}`] = { included: b.included, missing: b.missing, stripped_qa_only: b.stripped }
}

console.log(JSON.stringify(report, null, 2))
